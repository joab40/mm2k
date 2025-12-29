import React, { useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------
   MM2K Bench – App.jsx  (v2025.12.26-04)
   - CSV-tabell i lbs -> kg (runtime fetch /mm2k.csv)
   - 14 pass, nytt schema (Neg & FT enligt bild)
   - Profiler ("Teamet") + delningslänk/synk/historik
   - Failure Test (±2.5 kg) + 4-stjärnig indikator
------------------------------------------------------- */

/* ============ Små utils ============ */
const CURRENT_ACCOUNT_KEY = "mm2k_current_account_v4";
const ACCOUNTS_KEY       = "mm2k_accounts_v4";
const DEVICE_KEY         = "mm2k_device_id_v1";
const USERS_KEY          = (accId) => `mm2k_users_${accId}_v4`;
const META_KEY           = (accId) => `mm2k_meta_${accId}_v4`;

const LBS_TO_KG = 0.45359237;
const KG_TO_LBS = 1 / LBS_TO_KG;

const uid = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

const roundTo = (x, step = 0.5) => {
  const s = Number(step) || 0.5;
  return Math.round((Number(x) || 0) / s) * s;
};

const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

const saveLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const loadLS = (k, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(k) || ""); return (v ?? fallback); }
  catch { return fallback; }
};

async function safeJson(r) {
  try {
    const ct = r.headers?.get?.("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await r.json();
  } catch { return null; }
}

/* ============ Ronnie-quotes ============ */
const QUOTES = [
  { text: "Everybody wanna be a bodybuilder, but don’t nobody wanna lift no heavy-ass weight.", author: "Ronnie Coleman" },
  { text: "Ain’t nothin’ but a peanut!", author: "Ronnie Coleman" },
  { text: "Light weight, baby!", author: "Ronnie Coleman" },
  { text: "Yeah buddy!", author: "Ronnie Coleman" },
];
function getQuote() { return QUOTES[Math.floor(Math.random()*QUOTES.length)]; }

/* ============ Programschema (nya) ============ */
/*
  Varje pass har 3 set (A,B,C). kind: "normal" | "neg" | "ft" | "single"
  reps: siffra för normala/singel, null för neg/ft (visas i UI enligt typ).
*/
const PROGRAM = {
  1:  [{k:"normal", reps:6,  lab:"A"}, {k:"normal", reps:5, lab:"B"}, {k:"normal", reps:4, lab:"C"}],
  2:  [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:2, lab:"B"}, {k:"neg", reps:null, lab:"C (N)"}],
  3:  [{k:"normal", reps:6,  lab:"A"}, {k:"normal", reps:5, lab:"B"}, {k:"normal", reps:4, lab:"C"}],
  4:  [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:2, lab:"B"}, {k:"neg", reps:null, lab:"C (N)"}],
  5:  [{k:"normal", reps:6,  lab:"A"}, {k:"normal", reps:5, lab:"B"}, {k:"ft",  reps:null, lab:"C (FT)"}],
  6:  [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:2, lab:"B"}, {k:"neg", reps:null, lab:"C (N)"}],
  7:  [{k:"normal", reps:5,  lab:"A"}, {k:"normal", reps:3, lab:"B"}, {k:"ft",  reps:null, lab:"C (FT)"}],
  8:  [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:1, lab:"B"}, {k:"neg", reps:null, lab:"C (N)"}],
  9:  [{k:"normal", reps:5,  lab:"A"}, {k:"normal", reps:3, lab:"B"}, {k:"ft",  reps:null, lab:"C (FT)"}],
  10: [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:2, lab:"B"}, {k:"single", reps:1, lab:"C (1)"}],
  11: [{k:"normal", reps:5,  lab:"A"}, {k:"normal", reps:3, lab:"B"}, {k:"ft",  reps:null, lab:"C (FT)"}],
  12: [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:2, lab:"B"}, {k:"single", reps:1, lab:"C (1)"}],
  13: [{k:"normal", reps:5,  lab:"A"}, {k:"normal", reps:3, lab:"B"}, {k:"normal", reps:2, lab:"C"}],
  14: [{k:"normal", reps:3,  lab:"A"}, {k:"normal", reps:2, lab:"B"}, {k:"single", reps:1, lab:"C (1)"}],
};
const FT_WORKOUTS = [5,7,9,11]; // 4 FT-pass i denna vy (4 stjärnor)

/* ============ CSV Parsing ============ */
/*
  Förväntad struktur (efter metadata-rader):
  "IRM" eller "1RM", W1A, W1B, W1C, W2A, W2B, W2C, ... , W14C
  Därefter många rader:
  "100", val, val, val, ..., val
  "105", ...
  ...
  Alla värden i POUNDS (lbs). Vi konverterar till kg när vi visar.
*/
function parseMm2kCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => r.split(",").map(c => c.trim()));

  // hitta headern "IRM" eller "1RM"
  let idx = rows.findIndex(r => r[0].toUpperCase() === "IRM" || r[0].toUpperCase() === "1RM");
  if (idx === -1) return { ok:false, map:new Map() };

  const dataRows = rows.slice(idx+1);
  const map = new Map(); // 1rm_lbs:number -> number[42] (14*3)

  for (const r of dataRows) {
    const one = r[0];
    const oneLbs = Number(one);
    if (!Number.isFinite(oneLbs)) continue;

    // exakt 42 kolumner efter 1RM vore fint – men vi tolererar fler och tar första 42
    const vals = r.slice(1).map(x => Number(x)).filter(x => Number.isFinite(x));
    if (vals.length >= 42) {
      map.set(oneLbs, vals.slice(0, 42));
    }
  }
  return { ok:true, map };
}

// hämtar vikten (lbs) för givet workout (1..14), setIndex (0=A,1=B,2=C)
function lookupLbs(mm2kMap, oneRmKg, workoutId, setIndex) {
  if (!mm2kMap || mm2kMap.size === 0) return null;
  const oneLb = oneRmKg * KG_TO_LBS;

  // tabellen har steg om 5 lbs (100..570). Runda till närmaste 5.
  const nearest5 = Math.round(oneLb / 5) * 5;

  // hitta exakt, annars närmaste nedåt/uppåt som finns
  let keys = Array.from(mm2kMap.keys()).sort((a,b)=>a-b);
  let want = nearest5;
  if (!mm2kMap.has(want)) {
    // clamp till intervall
    if (want < keys[0]) want = keys[0];
    else if (want > keys[keys.length-1]) want = keys[keys.length-1];
    else {
      // leta närmaste
      let best = keys[0], d = Math.abs(keys[0]-want);
      for (const k of keys) {
        const dd = Math.abs(k - want);
        if (dd < d) { d = dd; best = k; }
      }
      want = best;
    }
  }
  const arr = mm2kMap.get(want);
  if (!arr) return null;

  const offset = (workoutId - 1) * 3 + setIndex;
  const lbs = arr[offset];
  return Number.isFinite(lbs) ? lbs : null;
}

/* ============ FT-stjärnor (4 st) ============ */
function ftStarsForReps(reps) {
  if (!Number.isFinite(reps)) return 0;
  if (reps >= 8) return 4;     // guld (full pott)
  if (reps >= 4) return 2;     // silver-ish
  if (reps >= 1) return 1;     // brons-ish
  return 0;
}
const Star = ({ filled }) => (
  <span className={filled ? "text-amber-500" : "text-slate-300"}>★</span>
);

/* ============ Huvudkomponent ============ */
export default function App() {
  /* Profiler ("Teamet") */
  const [accounts, setAccounts] = useState(loadLS(ACCOUNTS_KEY, []));
  const [accountId, setAccountId] = useState(() => {
    const stored = localStorage.getItem(CURRENT_ACCOUNT_KEY);
    return stored || (accounts[0]?.id ?? null);
  });
  useEffect(() => saveLS(ACCOUNTS_KEY, accounts), [accounts]);
  useEffect(() => { if (accountId) localStorage.setItem(CURRENT_ACCOUNT_KEY, String(accountId)); }, [accountId]);

  // blobKey auto
  useEffect(() => {
    const next = accounts.map(a => a.blobKey ? a : { ...a, blobKey: uid() });
    if (JSON.stringify(next) !== JSON.stringify(accounts)) setAccounts(next);
    // eslint-disable-next-line
  }, []);

  const deviceId = useMemo(() => getDeviceId(), []);

  // Användare per profil
  const [users, setUsers] = useState(() => loadLS(USERS_KEY(accountId), []));
  const [meta,  setMeta]  = useState(() => loadLS(META_KEY(accountId),  {rev:0}));
  useEffect(() => { setUsers(loadLS(USERS_KEY(accountId), [])); setMeta(loadLS(META_KEY(accountId), {rev:0})); }, [accountId]);
  useEffect(() => { if (accountId) saveLS(USERS_KEY(accountId), users); }, [users, accountId]);
  useEffect(() => { if (accountId) saveLS(META_KEY(accountId), meta); }, [meta, accountId]);

  const [selectedId, setSelectedId] = useState(() => users[0]?.id || null);
  useEffect(() => { setSelectedId(users[0]?.id || null); }, [users]);
  const selected = useMemo(() => users.find(u => u.id === selectedId) || null, [users, selectedId]);

  /* CSV-tabellen */
  const [mm2k, setMm2k] = useState(new Map());
  const [csvOk, setCsvOk] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/mm2k.csv", { cache: "no-store" });
        const t = await r.text();
        const { ok, map } = parseMm2kCsv(t);
        if (mounted) { setMm2k(map); setCsvOk(ok); }
      } catch {
        setCsvOk(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* Toast */
  const [toast, setToast] = useState(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(()=>setToast(null), 2700); return ()=>clearTimeout(t); }, [toast]);

  /* Delningslänk via ?k= */
  useEffect(() => {
    const k = new URLSearchParams(location.search).get("k");
    if (!k) return;
    const acc = { id: uid(), label: "Delad grupp", pin: null, blobKey: k, createdAt: new Date().toISOString() };
    setAccounts(prev => [...prev, acc]);
    setAccountId(acc.id);
    history.replaceState({}, "", location.pathname);
  }, []);

  /* Builder för rekommenderad vikt (kg) från CSV för valt pass */
  const prescriptions = useMemo(() => {
    if (!selected || mm2k.size === 0 || !csvOk) return {};
    const out = {};
    const wk = Number(selected.workingRmKg) || Number(selected.oneRmKg) || 0;
    const step = Number(selected.rounding || 2.5);

    for (let id = 1; id <= 14; id++) {
      const spec = PROGRAM[id];
      const row = spec.map((s, ix) => {
        const lbs = lookupLbs(mm2k, wk, id, ix);
        const kg  = Number.isFinite(lbs) ? lbs * LBS_TO_KG : null;
        const tgt = Number.isFinite(kg) ? roundTo(kg, step) : null;
        return { label: spec[ix].lab, kind: spec[ix].k, reps: spec[ix].reps ?? "—", targetKg: tgt };
      });
      out[id] = row;
    }
    return out;
  }, [selected, mm2k, csvOk]);

  /* Hjälpfunktioner för användare */
  const NEW_USER = () => ({
    id: uid(),
    name: `Athlete ${users.length + 1}`,
    startDate: new Date().toISOString().slice(0,10),
    oneRmKg: 100,
    workingRmKg: 100,
    rounding: 2.5,
    notes: "",
    logs: {}, // per workoutId: { sets:[{actualKg,reps}], failureReps, ftApplied, ftDelta, done, doneAt, lockedRows }
  });

  const addUser     = () => { const u = NEW_USER(); setUsers(p => [...p, u]); setSelectedId(u.id); };
  const removeUser  = (id) => { const n = users.filter(u => u.id !== id); setUsers(n); if (selectedId === id) setSelectedId(n[0]?.id || null); };
  const updateSel   = (patch) => setUsers(prev => prev.map(u => u.id===selectedId ? ({...u, ...patch}) : u));
  const resetLogs   = () => { if (!selected) return; if (!window.confirm("Rensa alla loggar för användaren?")) return; updateSel({ logs:{} }); };

  /* Logik för att markera klart + låsa raderna */
  const writeLog = (workoutId, entry) => {
    if (!selected) return;
    const prev = selected.logs?.[workoutId] || {};
    updateSel({ logs: { ...(selected.logs||{}), [workoutId]: { ...prev, ...entry } } });
  };

  const ensureDefaultSets = (log, rows, failureRepsVal) => {
    return rows.map((r, idx) => {
      const old = log?.sets?.[idx] || {};
      const kg  = Number.isFinite(old.actualKg) ? old.actualKg : r.targetKg ?? 0;
      let reps;
      if (Number.isFinite(old.reps)) reps = old.reps;
      else if (typeof r.reps === "number") reps = r.reps;
      else if (r.kind === "ft") reps = Number.isFinite(failureRepsVal) ? Number(failureRepsVal) : 0;
      else reps = 0;
      return { actualKg: kg, reps };
    });
  };

  const markDone = (workoutId, done=true) => {
    if (!selected) return;
    const log  = selected.logs?.[workoutId] || {};
    const rows = (log.done && Array.isArray(log.lockedRows) && log.lockedRows.length)
      ? log.lockedRows
      : (prescriptions[workoutId] || []);
    if (done) {
      const sets = ensureDefaultSets(log, rows, log.failureReps);
      writeLog(workoutId, { ...log, sets, done:true, doneAt:new Date().toISOString(), lockedRows: rows, lockedRmKg: selected.workingRmKg, lockedRounding: selected.rounding });
      const q = getQuote(); setToast({ type:"quote", msg:q.text, sub:`— ${q.author}` });
    } else {
      const { lockedRows, lockedRmKg, lockedRounding, doneAt, ...rest } = log;
      writeLog(workoutId, { ...rest, done:false });
    }
  };

  /* Failure Test */
  const deltaFromFT = (reps) => {
    if (!Number.isFinite(reps)) return 0;
    if (reps >= 8) return +2.5;
    if (reps <= 3) return -2.5;
    return 0;
  };

  const confirmFailure = (workoutId) => {
    if (!selected) return;
    const log = selected.logs?.[workoutId] || {};
    if (log.ftApplied) { setToast({ type:"note", msg:"FT redan bekräftad för detta pass." }); return; }
    const rows = (log.done && Array.isArray(log.lockedRows) && log.lockedRows.length)
      ? log.lockedRows
      : (prescriptions[workoutId] || []);

    const reps = Number(log.failureReps);
    const sets = ensureDefaultSets(log, rows, reps);
    writeLog(workoutId, { ...log, sets, failureReps: reps });

    // auto markera klart (låser vikterna)
    markDone(workoutId, true);

    const d = deltaFromFT(reps);
    writeLog(workoutId, { ...log, sets, failureReps: reps, ftApplied:true, ftDelta:d });
    if (d !== 0) updateSel({ workingRmKg: roundTo((selected.workingRmKg || 0) + d, 0.5) });

    const q = getQuote();
    setToast({ type:"quote", msg:q.text, sub:`FT: ${reps} reps (${d > 0 ? "+"+d : d} kg)` });
  };
  const undoFailure = (workoutId) => {
    if (!selected) return;
    const log = selected.logs?.[workoutId];
    if (!log?.ftApplied) { setToast({ type:"note", msg:"Ingen FT att ångra." }); return; }
    writeLog(workoutId, { ...log, ftApplied:false, ftDelta:undefined });
    // räkna om workingRM från start + andra FT
    let w = Number(selected.oneRmKg)||0;
    for (const id of FT_WORKOUTS) {
      const lg = selected.logs?.[id];
      if (lg?.ftApplied && Number.isFinite(lg.ftDelta)) w += Number(lg.ftDelta);
    }
    updateSel({ workingRmKg: roundTo(w, 0.5) });
    setToast({ type:"note", msg:"FT återkallad och arbets-1RM omräknad." });
  };

  /* Server/Blob (synk) */
  const [busy, setBusy] = useState(false);
  const activeAcc = accounts.find(a => a.id === accountId);
  const shareLink = activeAcc ? `${location.origin}${location.pathname}?k=${activeAcc.blobKey}` : "";

  const saveRemote = async () => {
    if (!accountId || !activeAcc) return;
    setBusy(true);
    try {
      const nextMeta = { rev:(meta?.rev||0)+1, lastSavedAt:new Date().toISOString(), savedByDeviceId: deviceId };
      const profile  = { users, profileMeta: nextMeta };
      const r = await fetch("/api/profiles/save", {
        method:"POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ blobKey: activeAcc.blobKey, profile })
      });
      if (!r.ok) throw new Error("Save failed");
      setMeta(nextMeta);
      setToast({ type:"up", msg:"Sparat till server (Blob)." });
    } catch (e) {
      alert("Kunde inte spara: " + e.message);
    } finally { setBusy(false); }
  };

  const loadRemote = async () => {
    if (!accountId || !activeAcc) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/profiles/${activeAcc.blobKey}`, { cache:"no-store" });
      if (!r.ok) throw new Error("Hittar ingen serverprofil");
      const data = await safeJson(r);
      if (data?.users) setUsers(data.users);
      if (data?.profileMeta) setMeta(data.profileMeta);
      setToast({ type:"up", msg:"Laddat från server (Blob)." });
    } catch (e) { alert("Kunde inte ladda: " + e.message); }
    finally { setBusy(false); }
  };

  const openHistory = async () => {
    if (!accountId || !activeAcc) return;
    setHistoryOpen(true); setHistoryBusy(true);
    try {
      const r = await fetch(`/api/profiles/history?key=${activeAcc.blobKey}`, { cache:"no-store" });
      const data = await safeJson(r);
      setHistoryItems(Array.isArray(data?.items) ? data.items : []);
    } catch { /* ignore */ }
    finally { setHistoryBusy(false); }
  };

  const syncNow = async () => {
    if (!accountId || !activeAcc) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/profiles/${activeAcc.blobKey}`, { cache:"no-store" });
      if (r.ok) {
        const remote = await safeJson(r);
        const remoteUsers = Array.isArray(remote?.users) ? remote.users : [];
        const remoteMeta  = remote?.profileMeta || { rev:0 };
        const localRev   = meta?.rev || 0;
        const remoteRev  = remoteMeta.rev || 0;

        if (remoteRev > localRev) {
          // enkel merge: välj den med flest klara pass per användare
          const byId = new Map(remoteUsers.map(u => [u.id, u]));
          const merged = [];
          for (const lu of users) {
            const ru = byId.get(lu.id);
            if (!ru) { merged.push(lu); continue; }
            const lDone = Object.values(lu.logs||{}).filter(x=>x.done).length;
            const rDone = Object.values(ru.logs||{}).filter(x=>x.done).length;
            merged.push(rDone >= lDone ? ru : lu);
            byId.delete(lu.id);
          }
          for (const ru of byId.values()) merged.push(ru);
          setUsers(merged); setMeta(remoteMeta);
          setToast({ type:"up", msg:"Synk: hämtade och slog ihop ändringar." });
        } else if (remoteRev < localRev) {
          await saveRemote();
        } else {
          setToast({ type:"note", msg:"Synk: inget att göra." });
        }
      } else {
        await saveRemote();
      }
    } catch (e) {
      alert("Synk misslyckades: " + e.message);
    } finally { setBusy(false); }
  };

  /* Historik */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);

  const restoreSnapshot = async (item) => {
    try {
      const r = await fetch(item.url, { cache:"no-store" });
      const data = await safeJson(r);
      if (Array.isArray(data?.users)) setUsers(data.users);
      if (data?.profileMeta) setMeta(data.profileMeta);
      setToast({ type:"up", msg:"Återställde snapshot lokalt. Spara till server för att skriva över." });
    } catch (e) { alert(e.message); }
  };

  /* Profiler ("Teamet") UI helpers */
  const createAccount = async () => {
    const label = window.prompt("Gruppnamn (t.ex. SSS U-elit)") || "Team";
    const maybe = window.prompt("Delningskod eller länk (valfritt):") || "";
    let blobKey = null;
    if (maybe.trim()) {
      try {
        const u = new URL(maybe);
        const k = u.searchParams.get("k");
        blobKey = k || maybe;
      } catch { blobKey = maybe; }
      blobKey = (blobKey || "").replace(/[^a-zA-Z0-9_-]/g,"");
      if (!blobKey) alert("Koden/länken kunde inte tolkas.");
    }
    const pin = (window.prompt("Valfri PIN (lämna tomt)") || "").trim() || null;
    const acc = { id: uid(), label, pin, blobKey: blobKey || uid(), createdAt: new Date().toISOString() };
    setAccounts(prev => [...prev, acc]);
    setAccountId(acc.id);

    // om vi kopplade till befintlig blob: hämta
    if (blobKey) {
      try {
        const r = await fetch(`/api/profiles/${blobKey}`, { cache:"no-store" });
        const d = await safeJson(r);
        if (d?.users) setUsers(d.users);
        if (d?.profileMeta) setMeta(d.profileMeta);
      } catch {/* ignore */}
    }
  };

  const deleteAccount = (id) => {
    if (!window.confirm("Ta bort gruppen?")) return;
    const n = accounts.filter(a => a.id !== id);
    setAccounts(n);
    if (accountId === id) setAccountId(n[0]?.id || null);
  };

  const switchAccount = (a) => {
    if (a.pin) {
      const entered = window.prompt("PIN krävs:");
      if (entered !== a.pin) { alert("Fel PIN"); return; }
    }
    setAccountId(a.id);
  };

  const copyShare = () => {
    navigator.clipboard?.writeText(shareLink);
    setToast({ type:"up", msg:"Delningslänk kopierad!" });
  };

  /* Render Helpers */
  const BTN_BASE  = "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm transition border";
  const BTN_DIM   = "bg-white/90 hover:bg-white text-slate-800 border-slate-200";
  const BTN_GOOD  = "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700";
  const BTN_BAD   = "bg-rose-600 hover:bg-rose-700 text-white border-rose-700";

  const header = (
    <header className="sticky top-0 z-10 border-b border-slate-200">
      <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-sky-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl select-none">🏋️‍♂️</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-black">MM2K Bench</h1>
              <p className="text-sm text-white/95">CSV-tabell → kg · 14 pass · FT & Negativ</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button disabled={busy} onClick={syncNow}       className={`${BTN_BASE} ${BTN_DIM} disabled:opacity-50`}>{busy ? "Synkar…" : "Synk nu"}</button>
            <button disabled={busy} onClick={saveRemote}    className={`${BTN_BASE} ${BTN_DIM} disabled:opacity-50`}>{busy ? "Sparar…" : "Spara till server"}</button>
            <button disabled={busy} onClick={loadRemote}    className={`${BTN_BASE} ${BTN_DIM} disabled:opacity-50`}>{busy ? "Laddar…" : "Ladda från server"}</button>
            <button onClick={openHistory} className={`${BTN_BASE} ${BTN_DIM}`}>Historik</button>
            <div className="relative">
              <button className={`${BTN_BASE} ${BTN_DIM}`}>Profil: {activeAcc?.label || "—"}</button>
              {/* enkel dropdown on click (toggle via CSS/JS lämnas borta för korthet) */}
            </div>
            <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={copyShare}>Koppla enhet</button>
            <span className="text-xs opacity-80">App v2025.12.26-04</span>
          </div>
        </div>
      </div>
    </header>
  );

  if (!accountId) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 antialiased">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="bg-white rounded-2xl shadow-lg border p-6">
            <h2 className="text-xl font-bold mb-3">Teamet</h2>
            <p className="text-slate-800 mb-4">Skapa en ny grupp eller anslut med delningskod.</p>
            <div className="flex gap-2">
              <button className={`${BTN_BASE} ${BTN_GOOD}`} onClick={createAccount}>+ Ny grupp</button>
              <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={()=>{
                const k = window.prompt("Klistra in delningslänk eller kod (?k=…):");
                if (!k) return;
                let code = k;
                try { const u = new URL(k); code = u.searchParams.get("k") || k; } catch {}
                const acc = { id: uid(), label:"Delad grupp", pin:null, blobKey: (code||"").replace(/[^a-zA-Z0-9_-]/g,""), createdAt:new Date().toISOString() };
                setAccounts(p=>[...p, acc]); setAccountId(acc.id);
              }}>Anslut med kod…</button>
            </div>
            {accounts.length>0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Befintliga grupper</h3>
                <ul className="space-y-1">
                  {accounts.map(a=>(
                    <li key={a.id} className="flex items-center justify-between rounded-lg border p-2">
                      <div>
                        <div className="font-medium">{a.label}</div>
                        <div className="text-xs text-slate-600">Blob: {a.blobKey?.slice(0,8)}…</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={()=>switchAccount(a)}>Välj</button>
                        <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={()=>deleteAccount(a.id)}>Ta bort</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 antialiased">
      {header}

      <main className="mx-auto max-w-6xl px-4 py-6 grid md:grid-cols-[280px,1fr] gap-6">
        {/* Teamet (tidigare “Profilen”) */}
        <aside className="bg-white rounded-2xl shadow-sm border p-3 h-fit">
          <h2 className="text-lg font-semibold mb-2">Användare i <span className="font-black">Teamet</span></h2>

          <ul className="space-y-1">
            {users.map(u=>(
              <li key={u.id} className={`flex items-center justify-between rounded-xl px-2 py-1 ${selectedId===u.id ? "bg-slate-100" : ""}`}>
                <button onClick={()=>setSelectedId(u.id)} className="text-left grow">
                  <div className="font-medium">{u.name||"Namnlös"}</div>
                  <div className="text-xs text-slate-700">1RM: {u.oneRmKg} kg · Arbets-1RM: {u.workingRmKg} kg</div>
                </button>
                <button className="text-slate-500 hover:text-rose-600" title="Ta bort" onClick={()=>removeUser(u.id)}>✕</button>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            <button className={`${BTN_BASE} ${BTN_GOOD} w-full`} onClick={addUser}>+ Ny användare</button>
          </div>

          {!!selected && (
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-800">Namn</span>
                <input className="rounded-xl border px-3 py-2 text-slate-900" value={selected.name} onChange={e=>updateSel({name:e.target.value})}/>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-800">Startdatum</span>
                <input type="date" className="rounded-xl border px-3 py-2 text-slate-900" value={selected.startDate} onChange={e=>updateSel({startDate:e.target.value})}/>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-800">1RM (kg)</span>
                <input type="number" className="rounded-xl border px-3 py-2 text-slate-900"
                  value={selected.oneRmKg}
                  onChange={e=>{
                    const v = Number(e.target.value||0);
                    updateSel({ oneRmKg:v, workingRmKg:v });
                  }}/>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-800">Arbets-1RM (kg)</span>
                <div className="flex gap-2">
                  <input type="number" className="rounded-xl border px-3 py-2 text-slate-900 grow"
                    value={selected.workingRmKg}
                    onChange={e=>updateSel({ workingRmKg:Number(e.target.value||0) })}/>
                  <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={()=>updateSel({ workingRmKg:selected.oneRmKg })}>Reset</button>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-800">Avrundning (kg-steg)</span>
                <select className="rounded-xl border px-3 py-2 text-slate-900" value={selected.rounding} onChange={e=>updateSel({ rounding:Number(e.target.value) })}>
                  {[1,1.25,2,2.5,5].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              {/* FT-stjärnor (4 st) – baserat på senaste FT-reps (om flera, ta senaste ifyllda) */}
              <div className="rounded-xl border p-3 bg-white text-sm flex items-center justify-between">
                <div className="font-medium">Failure-stjärnor</div>
                <div className="flex gap-1 text-xl">
                  {(() => {
                    // hämta senaste ifyllda FT
                    let lastReps = null;
                    for (const id of [...FT_WORKOUTS].reverse()) {
                      const r = selected.logs?.[id]?.failureReps;
                      if (Number.isFinite(r)) { lastReps = Number(r); break; }
                    }
                    const n = ftStarsForReps(lastReps ?? 0);
                    return [0,1,2,3].map(i => <Star key={i} filled={i < n} />);
                  })()}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-800">Anteckningar</span>
                <textarea rows={2} className="rounded-xl border px-3 py-2 text-slate-900"
                  value={selected.notes||""} onChange={e=>updateSel({notes:e.target.value})}/>
              </label>

              <div className="flex items-center gap-2">
                <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={resetLogs}>Rensa loggar</button>
              </div>

              <div className="text-xs text-slate-700 border rounded-xl p-2">
                <div>Rev: <span className="font-medium">{meta?.rev || 0}</span></div>
                <div>Senast sparad: {meta?.lastSavedAt ? new Date(meta.lastSavedAt).toLocaleString() : "—"}</div>
              </div>
            </div>
          )}
        </aside>

        {/* Workouts */}
        <section className="space-y-6">
          {!selected ? (
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
              <p className="text-slate-800">Lägg till en användare för att börja.</p>
            </div>
          ) : (
            <>
              {Array.from({length:14},(_,i)=>i+1).map(wid=>{
                const log  = selected.logs?.[wid] || { sets:[], done:false };
                const rows = (log.done && Array.isArray(log.lockedRows) && log.lockedRows.length)
                  ? log.lockedRows
                  : (prescriptions[wid] || []);
                const isLocked = !!log.done;

                return (
                  <article key={wid} className={`rounded-2xl border shadow-sm bg-white p-4 ${log.done ? "ring-2 ring-emerald-500/40" : ""}`}>
                    <header className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">#{wid}</h3>
                        <p className="text-[15px] text-slate-800 leading-snug">
                          Beräknat från arbets-1RM {selected.workingRmKg} kg
                          {log.done && log.doneAt ? ` (låst ${new Date(log.doneAt).toLocaleDateString()})` : ""}
                        </p>
                        {log.ftApplied && (
                          <div className="mt-1 inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">
                            FT bekräftad {log.ftDelta>0?`(+${log.ftDelta} kg)`:log.ftDelta<0?`(${log.ftDelta} kg)`:"(±0 kg)"}
                          </div>
                        )}
                      </div>
                      <button onClick={()=>markDone(wid, !log.done)} className={`${BTN_BASE} ${log.done ? BTN_GOOD : BTN_DIM}`}>
                        {log.done ? "Klart" : "Markera klart"}
                      </button>
                    </header>

                    <table className="w-full text-sm border-separate" style={{borderSpacing:"0 6px"}}>
                      <thead>
                        <tr className="text-left text-slate-800 font-semibold">
                          <th className="font-medium">Set</th>
                          <th className="font-medium">Reps</th>
                          <th className="font-medium">Rek. vikt</th>
                          <th className="font-medium">Logg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx)=>(
                          <tr key={idx} className="align-top">
                            <td className="py-1 pr-2 whitespace-nowrap">{r.label}</td>
                            <td className="py-1 pr-2 text-slate-900">{r.kind==="neg"?"Neg":(r.kind==="ft"?"FT":String(r.reps))}</td>
                            <td className="py-1 pr-2 text-slate-900 font-medium">{Number.isFinite(r.targetKg)?`${r.targetKg} kg`:"—"}</td>
                            <td className="py-1">
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  placeholder="kg"
                                  className="w-24 rounded-xl border border-slate-300 px-2 py-1 bg-white text-slate-900 placeholder-slate-400"
                                  value={log.sets?.[idx]?.actualKg ?? ""}
                                  disabled={isLocked}
                                  onChange={e=>{
                                    const sets=[...(log.sets||[])];
                                    sets[idx]={...(sets[idx]||{}), actualKg:Number(e.target.value||0)};
                                    writeLog(wid, { ...log, sets });
                                  }}
                                />
                                <input
                                  type="number"
                                  placeholder="reps"
                                  className="w-20 rounded-xl border border-slate-300 px-2 py-1 bg-white text-slate-900 placeholder-slate-400"
                                  value={log.sets?.[idx]?.reps ?? ""}
                                  disabled={isLocked}
                                  onChange={e=>{
                                    const sets=[...(log.sets||[])];
                                    sets[idx]={...(sets[idx]||{}), reps:Number(e.target.value||0)};
                                    writeLog(wid, { ...log, sets });
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* FT/Neg info */}
                    {rows.some(r=>r.kind==="neg") && (
                      <div className="mt-3 text-xs text-slate-800">
                        Negativt set: tung excentrisk 1x1. Träna säkert och med spotter.
                      </div>
                    )}

                    {rows.some(r=>r.kind==="ft") && (
                      <div className={`mt-4 rounded-xl ${isLocked?'bg-slate-50 border border-slate-200':'bg-amber-50 border border-amber-200'} p-3`}>
                        <div className="text-sm mb-2 font-medium">Failure Test</div>
                        <p className="text-sm text-slate-800 mb-2">
                          Gör max reps med **vikt enligt tabellen** på C-setet. Regler: ≤3 → −2.5 kg, 4–7 → ±0, ≥8 → +2.5 kg.
                        </p>
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="number"
                            placeholder="antal reps"
                            className="rounded-xl border px-3 py-2 w-36 text-slate-900"
                            value={log.failureReps ?? ""}
                            disabled={isLocked || log.ftApplied}
                            onChange={e=>writeLog(wid, { ...log, failureReps:Number(e.target.value||0) })}
                          />
                          {!isLocked && !log.ftApplied && (
                            <button className={`${BTN_BASE} ${BTN_GOOD}`}
                              onClick={()=>confirmFailure(wid)}
                              disabled={!Number.isFinite(Number(log.failureReps))}>
                              Bekräfta FT
                            </button>
                          )}
                          {log.ftApplied && (
                            <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={()=>undoFailure(wid)}>Ångra FT</button>
                          )}
                        </div>
                        {(isLocked || log.ftApplied) && (
                          <div className="text-xs text-slate-700">Passet är låst – ändringar ej tillåtna.</div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}
        </section>
      </main>

      {/* Historikpanel */}
      {historyOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={()=>setHistoryOpen(false)}>
          <div className="absolute right-4 top-16 w-[min(90vw,520px)] bg-white border shadow-xl rounded-2xl p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Snapshots (server)</h3>
              <button className={`${BTN_BASE} ${BTN_DIM}`} onClick={()=>setHistoryOpen(false)}>Stäng</button>
            </div>
            {historyBusy ? (
              <div className="text-sm text-slate-800">Hämtar…</div>
            ) : (
              <div className="max-h-[60vh] overflow-auto divide-y">
                {historyItems.length===0 ? (
                  <div className="text-sm text-slate-700">Ingen historik hittad.</div>
                ) : historyItems.map(it=>(
                  <div key={it.pathname} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.pathname.split("/").pop()}</div>
                      <div className="text-xs text-slate-700">{it.uploadedAt ? new Date(it.uploadedAt).toLocaleString() : "—"} · {it.size ? `${(it.size/1024).toFixed(1)} kB` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={it.url} target="_blank" rel="noreferrer" className={`${BTN_BASE} ${BTN_DIM}`}>Visa</a>
                      <button className={`${BTN_BASE} ${BTN_GOOD}`} onClick={()=>restoreSnapshot(it)}>Återställ lokalt</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          {toast.type === "quote" ? (
            <div className="rounded-2xl border bg-white text-slate-900 px-5 py-4 shadow-xl min-w-[280px] max-w-[420px]">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🏆</div>
                <div className="leading-snug">
                  <div className="text-lg font-extrabold tracking-tight">{toast.msg}</div>
                  {!!toast.sub && <div className="text-xs text-slate-700 mt-1">{toast.sub}</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-white text-slate-900 px-4 py-3 shadow-lg min-w-[260px] flex items-start gap-2">
              <span className="text-xl">{toast.type === "up" ? "🎉" : "ℹ️"}</span>
              <div className="text-sm leading-snug">
                <div className="font-semibold">{toast.type === "up" ? "Klart!" : "Notis"}</div>
                <div>{toast.msg}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-700">
        <div className="mt-6">
          Rev: {meta?.rev || 0} · Senast sparad: {meta?.lastSavedAt ? new Date(meta.lastSavedAt).toLocaleString() : "—"} · Device: {deviceId.slice(0,8)}…
        </div>
      </footer>
    </div>
  );
}
