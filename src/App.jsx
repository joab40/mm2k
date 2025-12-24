import React, { useEffect, useMemo, useRef, useState } from "react";

// MM2K Bench – 6 veckor / 14 pass
// Nytt i den här versionen:
// • Historik/Återställning (lista snapshots via /api/profiles/history och återställ lokalt)
// • "Koppla enhet" (delningslänk ?k=<blobKey>) – ladda profil på mobil/dator
// • Synk nu (pull/merge/push med profileMeta.rev)
// • FT-bekräftelse EN gång + auto-Klart; "Ångra FT" återkallar bekräftelsen och räknar om arbets‑1RM
// • Inga manuella ändringar när passet är Klart (inputs & FT-knapp är låsta)
// • Profilskapande-exempel ändrat till Vide

/****************
 * Local storage
 ****************/
const ACCOUNTS_KEY = "mm2k_accounts_v1";
const CURRENT_ACCOUNT_KEY = "mm2k_current_account_v1";
const LEGACY_USERS_KEY = "mm2k_users_v1"; // gammal struktur
const META_FOR = (accountId) => `mm2k_meta_v1_${accountId || "default"}`;
const USERS_FOR = (accountId) => `mm2k_users_v1_${accountId || "default"}`;
const DEVICE_ID_KEY = "mm2k_device_id";

function uid() { return Math.random().toString(36).slice(2, 10); }
function safeJSON(str, fb) { try { return JSON.parse(str); } catch { return fb; } }
function loadAccounts() { return safeJSON(localStorage.getItem(ACCOUNTS_KEY), []) || []; }
function saveAccounts(a) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }
function migrateLegacyUsers(accountId) {
  try {
    const legacy = localStorage.getItem(LEGACY_USERS_KEY);
    const key = USERS_FOR(accountId);
    if (legacy && !localStorage.getItem(key)) localStorage.setItem(key, legacy);
  } catch {}
}
function loadUsers(accountId) {
  if (!accountId) return [];
  migrateLegacyUsers(accountId);
  return safeJSON(localStorage.getItem(USERS_FOR(accountId)), []) || [];
}
function saveUsers(accountId, users) {
  if (!accountId) return;
  localStorage.setItem(USERS_FOR(accountId), JSON.stringify(users));
}
function loadMeta(accountId) {
  const fb = { rev: 0, lastSavedAt: null, savedByDeviceId: null };
  return (accountId && safeJSON(localStorage.getItem(META_FOR(accountId)), fb)) || fb;
}
function saveMeta(accountId, meta) {
  if (!accountId) return;
  localStorage.setItem(META_FOR(accountId), JSON.stringify(meta));
}
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = (crypto.randomUUID?.() || (uid()+uid())); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}
function generateOpaqueKey() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  try {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a, x => x.toString(16).padStart(2, "0")).join("");
  } catch { return uid()+uid(); }
}

/****************
 * Programlogik
 ****************/
const WORKOUTS = [
  { id: 1,  name: "Workout #1",  blocks: [ { sets: 1, reps: 8,  kind: "work" }, { sets: 1, reps: 6,  kind: "work" }, { sets: 3, reps: 5,  kind: "work" } ] },
  { id: 2,  name: "Workout #2",  blocks: [ { sets: 2, reps: 5,  kind: "work" }, { sets: 2, reps: 3,  kind: "work" }, { sets: 1, reps: 1,  kind: "single" } ] },
  { id: 3,  name: "Workout #3",  blocks: [ { sets: 1, reps: 8,  kind: "work" }, { sets: 1, reps: 6,  kind: "work" }, { sets: 3, reps: 5,  kind: "work" } ] },
  { id: 4,  name: "Workout #4",  blocks: [ { sets: 2, reps: 5,  kind: "work" }, { sets: 2, reps: 3,  kind: "work" }, { sets: 1, reps: 1,  kind: "single" } ] },
  { id: 5,  name: "Workout #5 (Failure Test)", blocks: [ { sets: 1, reps: 6,  kind: "work" }, { sets: 2, reps: 5,  kind: "work" }, { sets: 1, reps: "FT", kind: "failure" } ] },
  { id: 6,  name: "Workout #6 (Negative Only)", blocks: [ { sets: 2, reps: 3,  kind: "work" }, { sets: 2, reps: 2,  kind: "work" }, { sets: 1, reps: 1,  kind: "negative" } ] },
  { id: 7,  name: "Workout #7 (Failure Test)", blocks: [ { sets: 1, reps: 6,  kind: "work" }, { sets: 2, reps: 5,  kind: "work" }, { sets: 1, reps: "FT", kind: "failure" } ] },
  { id: 8,  name: "Workout #8 (Negative Only)", blocks: [ { sets: 2, reps: 3,  kind: "work" }, { sets: 2, reps: 1,  kind: "work" }, { sets: 1, reps: 1,  kind: "negative" } ] },
  { id: 9,  name: "Workout #9 (Failure Test)", blocks: [ { sets: 1, reps: 6,  kind: "work" }, { sets: 2, reps: 5,  kind: "work" }, { sets: 1, reps: "FT", kind: "failure" } ] },
  { id: 10, name: "Workout #10 (Negative Only)", blocks: [ { sets: 2, reps: 3,  kind: "work" }, { sets: 2, reps: 1,  kind: "work" }, { sets: 1, reps: 1,  kind: "negative" } ] },
  { id: 11, name: "Workout #11 (Failure Test)", blocks: [ { sets: 1, reps: 6,  kind: "work" }, { sets: 2, reps: 5,  kind: "work" }, { sets: 1, reps: "FT", kind: "failure" } ] },
  { id: 12, name: "Workout #12", blocks: [ { sets: 2, reps: 3,  kind: "work" }, { sets: 1, reps: 2,  kind: "work" }, { sets: 1, reps: 1,  kind: "single" } ] },
  { id: 13, name: "Workout #13 (Failure Test)", blocks: [ { sets: 1, reps: 6,  kind: "work" }, { sets: 2, reps: 5,  kind: "work" }, { sets: 1, reps: "FT", kind: "failure" } ] },
  { id: 14, name: "Workout #14 (Max Test)", blocks: [ { sets: 1, reps: 3,  kind: "work" }, { sets: 1, reps: 2,  kind: "work" }, { sets: 1, reps: 1,  kind: "max" } ] },
];

function getPercentsForWorkout(w) {
  const P = { 1:[0.60,0.70,0.80], 2:[0.70,0.80,0.90], 3:[0.65,0.75,0.85], 4:[0.75,0.85,1.00], 5:[0.70,0.80,0.85], 6:[0.85,0.95,1.10], 7:[0.75,0.85,0.90], 8:[0.90,0.97,1.12], 9:[0.76,0.88,0.92], 10:[0.92,0.98,1.13], 11:[0.78,0.90,0.95], 12:[0.95,1.00,1.05], 13:[0.80,0.92,0.97], 14:[1.00,1.08,1.15] };
  return P[w] || [0.7,0.8,0.9];
}
const KG_STEP_DEFAULT = 2.5;
const roundTo = (v, step = KG_STEP_DEFAULT) => Number.isFinite(v) ? Math.round(v/step)*step : 0;

function buildPrescription(id, rm, step) {
  const [p1, p2, p3] = getPercentsForWorkout(id);
  const blocks = WORKOUTS.find(w => w.id === id)?.blocks || [];
  const ws = [ roundTo(rm*p1, step), roundTo(rm*p2, step), roundTo(rm*p3, step) ];
  const rows = [];
  blocks.forEach((b, i) => {
    const base = b.kind === "failure" ? ws[1] : ws[i];
    const label = (
      b.kind === "failure" ? "Failure Test" :
      b.kind === "negative" ? "Negative only" :
      b.kind === "max" ? "Max Test" :
      b.kind === "single" ? "Single" : "Work"
    );
    for (let s=0; s<b.sets; s++) rows.push({ kind:b.kind, label, reps:b.reps, targetKg:base });
  });
  return rows;
}
function calcFtDelta(reps) {
  if (!Number.isFinite(reps)) return 0;
  if (reps >= 8) return +2.5;
  if (reps <= 3) return -2.5;
  return 0;
}

/****************
 * UI helpers
 ****************/
const BTN_BASE = "h-9 px-3 rounded-xl border inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors";
const BTN_SOLID = "bg-slate-900 text-white border-slate-900 hover:opacity-90";
const BTN_SUBTLE = "bg-white text-slate-900 border-slate-200 hover:bg-slate-100";
const BTN_GOOD = "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200";
const BTN_BAD = "bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200";
const LiftEmoji = ({ className="text-6xl md:text-7xl" }) => <span className={className} role="img" aria-label="weightlifter">🏋️‍♂️</span>;

/****************
 * Default user
 ****************/
const NEW_USER = () => ({
  id: uid(),
  name: "",
  startDate: new Date().toISOString().slice(0,10),
  oneRmKg: 100,
  workingRmKg: 100,
  rounding: KG_STEP_DEFAULT,
  notes: "",
  logs: {}
});

/****************
 * Merge (nyast logg per pass vinner)
 ****************/
function mergeProfiles(localUsers, remoteUsers) {
  const map = new Map(localUsers.map(u => [u.id, u]));
  for (const r of remoteUsers) {
    const l = map.get(r.id);
    if (!l) { map.set(r.id, r); continue; }
    const mergedLogs = { ...(l.logs||{}) };
    for (const [wid, rlog] of Object.entries(r.logs||{})) {
      const llog = l.logs?.[wid];
      if (!llog) { mergedLogs[wid] = rlog; continue; }
      const ld = Date.parse(llog.doneAt || 0);
      const rd = Date.parse(rlog.doneAt || 0);
      mergedLogs[wid] = (rd > ld) ? rlog : llog;
    }
    map.set(r.id, { ...l, ...r, logs: mergedLogs });
  }
  return Array.from(map.values());
}

/****************
 * Komponent
 ****************/
export default function App() {
  // Accounts
  const [accounts, setAccounts] = useState(loadAccounts());
  const [accountId, setAccountId] = useState(() => localStorage.getItem(CURRENT_ACCOUNT_KEY) || (loadAccounts()[0]?.id || null));
  useEffect(() => { saveAccounts(accounts); }, [accounts]);
  useEffect(() => { if (accountId) localStorage.setItem(CURRENT_ACCOUNT_KEY, String(accountId)); }, [accountId]);

  // Se till att varje konto har blobKey (ogenomskinligt ID)
  useEffect(() => {
    const next = accounts.map(a => a.blobKey ? a : { ...a, blobKey: generateOpaqueKey() });
    if (JSON.stringify(next) !== JSON.stringify(accounts)) setAccounts(next);
    // eslint-disable-next-line
  }, []);

  // Device id (för spårning i profileMeta)
  const deviceId = useMemo(() => getDeviceId(), []);

  // Users + Meta för aktivt konto
  const [users, setUsers] = useState(() => loadUsers(accountId));
  const [meta, setMeta] = useState(() => loadMeta(accountId));
  useEffect(() => { setUsers(loadUsers(accountId)); setMeta(loadMeta(accountId)); }, [accountId]);
  useEffect(() => { if (accountId) saveUsers(accountId, users); }, [users, accountId]);
  useEffect(() => { if (accountId) saveMeta(accountId, meta); }, [meta, accountId]);

  // Selected user
  const [selectedId, setSelectedId] = useState(() => users[0]?.id || null);
  useEffect(() => { setSelectedId(users[0]?.id || null); }, [users]);
  const selected = useMemo(() => users.find(u => u.id === selectedId) || null, [users, selectedId]);

  // UI state
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [linkPanel, setLinkPanel] = useState(false);
  const [linkCode, setLinkCode] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const importRef = useRef(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(()=>setToast(null), 3000); return ()=>clearTimeout(t); }, [toast]);

  // ▼ Nytt: plocka ut blobKey ur manuell kod/länk
  function extractBlobKeyFromInput(input) {
    let s = String(input || '').trim();
    if (!s) return null;
    // Försök som URL med ?k=
    try {
      const u = new URL(s);
      const k = u.searchParams.get('k');
      if (k) return k;
    } catch {}
    // Rensa ev. prefix/suffix
    s = s.replace(/^profiles\//, '').replace(/\.json$/, '');
    const parts = s.split(/[?#/]/).filter(Boolean);
    const candidate = parts.length ? parts[parts.length-1] : s;
    if (/^[A-Za-z0-9_-]{12,}$/.test(candidate)) return candidate;
    return null;
  }

  // Fånga ?k=<blobKey> för enkel "koppla enhet"
  useEffect(() => {
    const k = new URLSearchParams(location.search).get("k");
    if (!k) return;
    const label = "Delad profil";
    const acc = { id: uid(), label, pin: null, blobKey: k, createdAt: new Date().toISOString() };
    setAccounts(prev => [...prev, acc]);
    setAccountId(acc.id);
    history.replaceState({}, "", location.pathname);
  }, []);

  // Prescriptions per workout
  const prescriptions = useMemo(() => {
    if (!selected) return {};
    const out = {}; for (const w of WORKOUTS) out[w.id] = buildPrescription(w.id, selected.workingRmKg, selected.rounding); return out;
  }, [selected]);

  // Prognos (115% + bekräftade FT)
  const projected = useMemo(() => {
    if (!selected) return null;
    const FT = [5,7,9,11,13];
    const base = roundTo(selected.oneRmKg * 1.15, 0.5);
    let delta = 0, completed = 0;
    for (const id of FT) {
      const log = selected.logs?.[id];
      if (log?.done) {
        completed++;
        if (log.ftApplied) delta += Number(log.ftDelta || 0);
        else if (Number.isFinite(log?.failureReps)) delta += calcFtDelta(Number(log.failureReps));
      }
    }
    const remaining = FT.length - completed;
    const point = roundTo(base + delta, 0.5);
    return {
      min: roundTo(point - 2.5*remaining, 0.5),
      max: roundTo(point + 2.5*remaining, 0.5),
      point, delta, remaining
    };
  }, [selected]);

  // Account actions
  async function createAccount() {
    const label = window.prompt("Profilnamn (t.ex. Vide)") || "Profil"; // ändrat exempel
    // Ny fråga: Har du delningskod/länk? (valfritt)
    const maybeCode = window.prompt("Har du en delningskod eller länk (valfritt)? Klistra in här eller lämna tomt.") || "";
    let blobKey = null;
    if (maybeCode.trim()) {
      blobKey = extractBlobKeyFromInput(maybeCode);
      if (!blobKey) { alert('Koden/länken kunde inte tolkas. Du kan koppla senare via "Anslut med kod".'); }
    }
    const pin = window.prompt("Valfri PIN (lämna tomt)") || "";
    const acc = { id: uid(), label, pin: pin.trim()?pin.trim():null, blobKey: blobKey || generateOpaqueKey(), createdAt: new Date().toISOString() };
    const next = [...accounts, acc]; setAccounts(next); setAccountId(acc.id);
    // Om vi fick en blobKey: försök ladda serverprofil direkt
    if (blobKey) {
      try {
        const r = await fetch(`/api/profiles/${blobKey}`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data.users)) setUsers(data.users);
          if (data.profileMeta) setMeta(data.profileMeta);
          setToast({ type:'up', msg:'Profil kopplad och laddad från server.' });
        } else {
          setToast({ type:'note', msg:'Kopplad kod hittades, men ingen serverprofil fanns ännu.' });
        }
      } catch {}
    }
  }
  function deleteAccount(id) {
    if (!window.confirm("Ta bort profilen?")) return;
    const next = accounts.filter(a => a.id !== id); setAccounts(next); if (accountId === id) setAccountId(next[0]?.id || null);
  }
  function switchAccount(a) {
    if (a.pin) { const entered = window.prompt("Ange PIN") || ""; if (entered !== a.pin) { alert("Fel PIN"); return; } }
    setAccountId(a.id); setShowAccountPanel(false);
  }
  function signOut() { setAccountId(null); setShowAccountPanel(false); }

  // Snabb anslutning med kod från inloggsskärmen
  async function connectWithCodeFlow(prefilled) {
    const input = typeof prefilled === 'string' ? prefilled : window.prompt('Klistra in delningskod eller länk (med ?k=)');
    if (!input) return;
    const key = extractBlobKeyFromInput(input);
    if (!key) { alert('Koden/länken kunde inte tolkas. Försök igen.'); return; }
    const label = 'Delad profil';
    const acc = { id: uid(), label, pin: null, blobKey: key, createdAt: new Date().toISOString() };
    const next = [...accounts, acc]; setAccounts(next); setAccountId(acc.id);
    try {
      const r = await fetch(`/api/profiles/${key}`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.users)) setUsers(data.users);
        if (data.profileMeta) setMeta(data.profileMeta);
        setToast({ type:'up', msg:'Profil kopplad och laddad från server.' });
      } else {
        setToast({ type:'note', msg:'Koden är kopplad, men ingen serverprofil fanns ännu.' });
      }
    } catch {}
  }

  // User actions
  function addUser() { if (!accountId) return; const u = NEW_USER(); u.name = `Athlete ${users.length + 1}`; setUsers(prev => [...prev, u]); setSelectedId(u.id); }
  function updateSelected(patch) { setUsers(prev => prev.map(u => (u.id === selectedId ? { ...u, ...patch } : u))); }
  function removeUser(id) { const next = users.filter(u => u.id !== id); setUsers(next); if (selectedId === id) setSelectedId(next[0]?.id || null); }
  function resetLogs() { if (!selected) return; if (!window.confirm("Rensa alla loggar?")) return; updateSelected({ logs: {} }); }

  // Hjälpare för logg/FT
  function ensureDefaultSets(log, rows, failureRepsVal) {
    return rows.map((r, idx) => {
      const old = log?.sets?.[idx] || {};
      const actualKg = Number.isFinite(old.actualKg) ? old.actualKg : r.targetKg;
      let reps;
      if (Number.isFinite(old.reps)) reps = old.reps;
      else if (typeof r.reps === "number") reps = r.reps;
      else if (r.kind === "failure") reps = Number.isFinite(failureRepsVal) ? Number(failureRepsVal) : 0;
      else reps = 0;
      return { actualKg, reps };
    });
  }
  function writeLog(workoutId, entry) { if (!selected) return; const prev = selected.logs?.[workoutId] || { sets: [], done: false }; updateSelected({ logs: { ...selected.logs, [workoutId]: { ...prev, ...entry } } }); }
  function markDone(workoutId, done = true, opts = {}) {
    if (!selected) return; const prev = selected.logs?.[workoutId] || { sets: [], done: false };
    if (done && !prev.done) {
      const rowsNow = opts.forceRows || buildPrescription(workoutId, selected.workingRmKg, selected.rounding);
      const sets = ensureDefaultSets(prev, rowsNow, prev.failureReps);
      writeLog(workoutId, { ...prev, sets, done: true, doneAt: new Date().toISOString(), lockedRmKg: selected.workingRmKg, lockedRounding: selected.rounding, lockedRows: rowsNow });
    } else if (!done && prev.done) {
      const { lockedRmKg, lockedRounding, lockedRows, doneAt, ...rest } = prev; writeLog(workoutId, { ...rest, done: false });
    } else { writeLog(workoutId, { ...prev, done }); }
  }
  function confirmFailure(workoutId) {
    if (!selected) return; const log = selected.logs?.[workoutId] || {};
    if (log.ftApplied) { setToast({ type: "note", msg: "Failure Test är redan bekräftat för detta pass." }); return; }
    const rowsNow = (log?.done && Array.isArray(log.lockedRows) && log.lockedRows.length) ? log.lockedRows : (prescriptions[workoutId] || []);
    const reps = Number(log.failureReps);
    const ftDelta = calcFtDelta(reps);
    const sets = ensureDefaultSets(log, rowsNow, reps);
    writeLog(workoutId, { ...log, sets, failureReps: reps });
    markDone(workoutId, true, { forceRows: rowsNow }); // auto-Klart
    writeLog(workoutId, { ...log, sets, failureReps: reps, ftApplied: true, ftDelta }); // lås FT
    if (ftDelta !== 0) updateSelected({ workingRmKg: roundTo(selected.workingRmKg + ftDelta, 0.5) });
    if (ftDelta > 0) setToast({ type: 'up', msg: 'Grattis! Failure Test klarat (+2.5 kg)' });
    if (ftDelta < 0) setToast({ type: 'note', msg: 'Vikten har sänkts (-2.5 kg) enligt Failure Test.' });
  }
  function recomputeWorkingRm(excludeId = null) {
    if (!selected) return;
    const FT_IDS = [5,7,9,11,13];
    let w = Number(selected.oneRmKg) || 0;
    for (const id of FT_IDS) {
      if (id === excludeId) continue;
      const lg = selected.logs?.[id];
      if (lg?.ftApplied && Number.isFinite(lg.ftDelta)) w += Number(lg.ftDelta);
    }
    return roundTo(w, 0.5);
  }
  function undoFailure(workoutId) {
    if (!selected) return; const log = selected.logs?.[workoutId];
    if (!log?.ftApplied) { setToast({ type: 'note', msg: 'Ingen FT att ångra för detta pass.' }); return; }
    const newWork = recomputeWorkingRm(workoutId);
    writeLog(workoutId, { ...log, ftApplied: false, ftDelta: undefined });
    updateSelected({ workingRmKg: newWork });
    setToast({ type: 'note', msg: 'FT återkallad. Arbets‑1RM har räknats om.' });
  }

  // Export/Import
  function exportProfile() {
    if (!accountId) return; const payload = { users, profileMeta: meta };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `mm2k_profile_${accountId}.json`; a.click(); URL.revokeObjectURL(url);
  }
  function importProfile(file) {
    const reader = new FileReader(); reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data && Array.isArray(data.users)) setUsers(data.users);
        if (data && data.profileMeta) setMeta(data.profileMeta);
        else setMeta(m => ({ ...m }));
      } catch (e) { alert("Kunde inte läsa JSON: " + e.message); }
    }; reader.readAsText(file);
  }

  // Server (Blob)
  async function saveRemoteProfile() {
    if (!accountId) return; const acc = accounts.find(a => a.id === accountId); const blobKey = acc?.blobKey || acc?.id; setBusy(true);
    try {
      const nextMeta = { rev: (meta?.rev||0)+1, lastSavedAt: new Date().toISOString(), savedByDeviceId: deviceId };
      const profile = { users, profileMeta: nextMeta };
      const r = await fetch('/api/profiles/save', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ blobKey, profile }) });
      if (!r.ok) throw new Error('Save failed');
      setMeta(nextMeta);
      setToast({ type: 'up', msg: 'Sparat till server (Blob)' });
    } catch (e) { alert('Kunde inte spara: ' + e.message); } finally { setBusy(false); }
  }
  async function loadRemoteProfile() {
    if (!accountId) return; const acc = accounts.find(a => a.id === accountId); const blobKey = acc?.blobKey || acc?.id; setBusy(true);
    try {
      const r = await fetch(`/api/profiles/${blobKey}`);
      if (!r.ok) throw new Error('Hittar ingen serverprofil');
      const data = await r.json();
      if (Array.isArray(data.users)) setUsers(data.users);
      if (data.profileMeta) setMeta(data.profileMeta);
      setToast({ type: 'up', msg: 'Laddat från server (Blob)' });
    } catch (e) { alert('Kunde inte ladda: ' + e.message); } finally { setBusy(false); }
  }

  // Historik (lista och återställ)
  async function openHistory() {
    if (!accountId) return; const acc = accounts.find(a => a.id === accountId); const blobKey = acc?.blobKey || acc?.id;
    setHistoryOpen(true); setHistoryBusy(true);
    try {
      const r = await fetch(`/api/profiles/history?key=${blobKey}`);
      if (!r.ok) throw new Error('Kunde inte lista historik');
      const data = await r.json();
      setHistoryItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) { alert(e.message); } finally { setHistoryBusy(false); }
  }
  async function restoreSnapshot(item) {
    try {
      const r = await fetch(item.url);
      if (!r.ok) throw new Error('Kunde inte hämta snapshot');
      const data = await r.json();
      if (Array.isArray(data.users)) setUsers(data.users);
      if (data.profileMeta) setMeta(data.profileMeta);
      setToast({ type:'up', msg:'Återställde snapshot lokalt. Glöm inte spara till server om du vill skriva över.' });
    } catch (e) { alert(e.message); }
  }

  // Delningslänk
  const activeAcc = accounts.find(a => a.id === accountId);
  const shareLink = activeAcc ? `${location.origin}${location.pathname}?k=${activeAcc.blobKey}` : '';
  function copyShareLink() { navigator.clipboard?.writeText(shareLink); setToast({ type:'up', msg:'Delningslänk kopierad!' }); }

  // Render: login-läge
  if (!accountId) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 grid place-items-center p-6">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border p-6">
          <div className="text-center mb-4">
            <div className="text-3xl md:text-4xl font-extrabold flex items-center justify-center gap-3"><LiftEmoji /><span>MM2K Bench</span></div>
            <div className="text-slate-700">6 veckor, 14 pass, lokala profiler</div>
          </div>
          <div className="space-y-3">
            <button className={`${BTN_BASE} ${BTN_SOLID} w-full`} onClick={createAccount}>+ Ny profil</button>
            <button className={`${BTN_BASE} ${BTN_SUBTLE} w-full`} onClick={connectWithCodeFlow}>Anslut med kod…</button>
            {accounts.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Befintliga profiler</div>
                <ul className="space-y-2">
                  {accounts.map(a => (
                    <li key={a.id} className="flex items-center justify-between rounded-xl border p-2">
                      <div>
                        <div className="font-medium">{a.label}</div>
                        <div className="text-xs text-slate-500">{a.pin ? 'PIN-skyddad' : 'Ingen PIN'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={() => switchAccount(a)}>Välj</button>
                        <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={() => deleteAccount(a.id)}>Ta bort</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-xs text-slate-500">Profiler sparas lokalt i webbläsaren.</div>
          </div>
        </div>
      </div>
    );
  }

  // Render: huvudapp
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200">
        <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-sky-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <LiftEmoji />
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">MM2K Bench</h1>
                <p className="text-sm md:text-base text-white/95">6 veckor, 14 pass, kg-beräkningar, FT-bekräftelse</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
               e.target.files && importProfile(e.target.files[0])} />
              <button disabled={busy} onClick={syncNow} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy ? 'Synkar…' : 'Synk nu'}</button>
              <button disabled={busy} onClick={saveRemoteProfile} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy ? 'Sparar…' : 'Spara till server'}</button>
              <button disabled={busy} onClick={loadRemoteProfile} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy ? 'Laddar…' : 'Ladda från server'}</button>
              <button onClick={openHistory} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Historik</button>
              <div className="relative">
                <button onClick={() => setShowAccountPanel(v => !v)} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Profil: {activeAcc?.label || 'Okänd'}</button>
                {showAccountPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-white text-slate-900 rounded-xl shadow-lg border p-2">
                    <div className="px-2 py-1 text-xs text-slate-500">Profiler</div>
                    <ul className="max-h-60 overflow-auto">
                      {accounts.map(a => (
                        <li key={a.id} className="flex items-center justify-between rounded-lg hover:bg-slate-50 px-2 py-1">
                          <button className="text-left" onClick={() => switchAccount(a)}>
                            <div className="font-medium">{a.label}</div>
                            <div className="text-xs text-slate-500">{a.pin ? 'PIN' : 'Ingen PIN'} · Blob-ID: {a.blobKey?.slice(0,8)}…</div>
                          </button>
                          <button className="text-slate-500 hover:text-rose-600" onClick={() => deleteAccount(a.id)} title="Ta bort">✕</button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-2 p-2">
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={createAccount}>+ Ny profil</button>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setLinkPanel(v=>!v)}>Koppla enhet</button>
                    </div>
                    {linkPanel && (
                      <div className="p-2 border rounded-xl text-xs space-y-3">
                        <div className="font-medium">Delningslänk</div>
                        <div className="select-all break-all bg-slate-50 border rounded p-2">{shareLink}</div>
                        <div className="flex gap-2">
                          <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={copyShareLink}>Kopiera</button>
                          <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setLinkPanel(false)}>Stäng</button>
                        </div>

                        <div className="pt-1 border-t" />
                        <div className="font-medium">Anslut med kod eller länk</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={linkCode}
                            onChange={e=>setLinkCode(e.target.value)}
                            placeholder="Klistra in kod eller ?k=…"
                            className="rounded-xl border px-3 py-2 grow"
                          />
                          <button
                            className={`${BTN_BASE} ${BTN_SUBTLE}`}
                            onClick={()=>{ if (linkCode.trim()) { connectWithCodeFlow(linkCode.trim()); setLinkCode(""); setLinkPanel(false);} }}
                          >Anslut</button>
                        </div>
                        <div className="text-[10px] text-slate-500">Öppna länken på din andra enhet (mobil/dator) eller klistra in delningskoden här för att koppla denna profil.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid md:grid-cols-[260px,1fr] gap-6">
        <aside className="bg-white rounded-2xl shadow-sm border p-3 h-fit">
          <h2 className="text-lg font-semibold mb-2">Användare i profilen</h2>
          <ul className="space-y-1">
            {users.map(u => (
              <li key={u.id} className={`flex items-center justify-between rounded-xl px-2 py-1 ${selectedId === u.id ? 'bg-slate-100' : ''}`}>
                <button onClick={() => setSelectedId(u.id)} className="text-left grow">
                  <div className="font-medium">{u.name || 'Namnlös'}</div>
                  <div className="text-xs text-slate-500">1RM: {u.oneRmKg} kg · Arbets-1RM: {u.workingRmKg} kg</div>
                </button>
                <button onClick={() => removeUser(u.id)} className="text-slate-500 hover:text-rose-600" title="Ta bort">✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <button onClick={addUser} className={`${BTN_BASE} ${BTN_SOLID} w-full`}>+ Ny användare</button>
          </div>
          <div className="mt-3 text-xs text-slate-500 border rounded-xl p-2">
            <div>Rev: <span className="font-medium">{meta?.rev || 0}</span></div>
            <div>Senast sparad: {meta?.lastSavedAt ? new Date(meta.lastSavedAt).toLocaleString() : '–'}</div>
          </div>
        </aside>

        <section className="space-y-6">
          {!selected ? (
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
              <p className="text-slate-600">Lägg till en användare för att börja.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold mb-4">Profil och inställningar</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Namn</span>
                    <input className="rounded-xl border px-3 py-2" value={selected.name} onChange={e=>updateSelected({name:e.target.value})} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Startdatum</span>
                    <input type="date" className="rounded-xl border px-3 py-2" value={selected.startDate} onChange={e=>updateSelected({startDate:e.target.value})} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">1RM (kg)</span>
                    <input type="number" className="rounded-xl border px-3 py-2" value={selected.oneRmKg} onChange={e=>{ const v = Number(e.target.value||0); updateSelected({ oneRmKg:v, workingRmKg:v }); }} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Arbets-1RM (kg)</span>
                    <div className="flex gap-2">
                      <input type="number" className="rounded-xl border px-3 py-2 grow" value={selected.workingRmKg} onChange={e=>updateSelected({ workingRmKg:Number(e.target.value||0) })} />
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>updateSelected({ workingRmKg:selected.oneRmKg })}>Reset</button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Avrundning (kg-steg)</span>
                    <select className="rounded-xl border px-3 py-2" value={selected.rounding} onChange={e=>updateSelected({ rounding:Number(e.target.value) })}>
                      {[1,1.25,2,2.5,5].map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <div className="md:col-span-2">
                    <div className="rounded-xl border p-3 bg-slate-50 text-sm">
                      {projected ? (
                        <>
                          <div className="font-medium">Prognos 1RM efter #14:</div>
                          <div>Bas (115% av start): <span className="font-medium">{roundTo(selected.oneRmKg*1.15, 0.5)} kg</span></div>
                          <div>Uppnått via Failure-test: <span className="font-medium">{projected.delta >= 0 ? "+" : ""}{projected.delta} kg</span></div>
                          <div className="mt-1">Intervall: <span className="font-semibold">{projected.min} – {projected.max} kg</span> (återstår {projected.remaining} FT)</div>
                        </>
                      ) : (
                        <div>Ingen prognos tillgänglig.</div>
                      )}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-sm text-slate-600">Anteckningar</span>
                    <textarea rows={2} className="rounded-xl border px-3 py-2" value={selected.notes||""} onChange={e=>updateSelected({notes:e.target.value})}/>
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={resetLogs} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Rensa loggar</button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {WORKOUTS.map(w => {
                  const log = selected.logs?.[w.id] || { sets: [], done: false, failureReps: undefined };
                  const rows = (log.done && Array.isArray(log.lockedRows) && log.lockedRows.length) ? log.lockedRows : (prescriptions[w.id] || []);
                  const reps = log.failureReps;
                  const suggestion = (typeof reps === "number" && !Number.isNaN(reps)) ? (reps >= 8 ? "increase" : (reps <= 3 ? "decrease" : "hold")) : null;
                  const proposedUp = roundTo(selected.workingRmKg + 2.5, 0.5);
                  const proposedDown = roundTo(Math.max(0, selected.workingRmKg - 2.5), 0.5);
                  const isLocked = !!log.done;

                  return (
                    <article key={w.id} className={`rounded-2xl border shadow-sm bg-white p-4 ${log.done ? 'ring-2 ring-green-500/40' : ''}`}>
                      <header className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold">{w.name}</h3>
                          <p className="text-xs text-slate-500">Beräknat från arbets-1RM {selected.workingRmKg} kg{log.done && log.doneAt ? ` (låst ${new Date(log.doneAt).toLocaleDateString()})` : ''}</p>
                          {log.ftApplied && (
                            <div className="mt-1 inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">
                              FT bekräftad {log.ftDelta>0?`(+${log.ftDelta} kg)`:log.ftDelta<0?`(${log.ftDelta} kg)`:"(±0 kg)"}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>markDone(w.id, !log.done)} className={`${BTN_BASE} ${log.done ? BTN_GOOD : BTN_SUBTLE}`}>{log.done?'Klart':'Markera klart'}</button>
                        </div>
                      </header>

                      <table className="w-full text-sm border-separate" style={{borderSpacing:"0 6px"}}>
                        <thead>
                          <tr className="text-left text-slate-500"><th className="font-medium">Set</th><th className="font-medium">Reps</th><th className="font-medium">Rek. vikt</th><th className="font-medium">Logg</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => (
                            <tr key={idx} className="align-top">
                              <td className="py-1 pr-2 whitespace-nowrap">{r.label}</td>
                              <td className="py-1 pr-2">{String(r.reps)}</td>
                              <td className="py-1 pr-2">{r.targetKg} kg</td>
                              <td className="py-1">
                                <div className="flex gap-2">
                                  <input type="number" placeholder="kg" className="w-24 rounded-xl border px-2 py-1" value={log.sets?.[idx]?.actualKg ?? ''} disabled={isLocked}
                                    onChange={e=>{ const sets=[...(log.sets||[])]; sets[idx]={...(sets[idx]||{}), actualKg:Number(e.target.value||0)}; writeLog(w.id, { ...log, sets }); }} />
                                  <input type="number" placeholder="reps" className="w-20 rounded-xl border px-2 py-1" value={log.sets?.[idx]?.reps ?? ''} disabled={isLocked}
                                    onChange={e=>{ const sets=[...(log.sets||[])]; sets[idx]={...(sets[idx]||{}), reps:Number(e.target.value||0)}; writeLog(w.id, { ...log, sets }); }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {rows.some(r=>r.kind === "failure") && (
                        <div className={`mt-4 rounded-xl ${isLocked? 'bg-slate-50 border border-slate-200' : 'bg-amber-50 border border-amber-200'} p-3`}>
                          <div className="text-sm mb-2 font-medium">Failure Test</div>
                          <p className="text-sm text-slate-600 mb-2">Max reps med block 2-vikten ({rows[1]?.targetKg} kg). 4–7 reps: ingen ändring. ≤3: −2.5 kg. ≥8: +2.5 kg.</p>
                          <div className="flex items-center gap-2 mb-2">
                            <input type="number" placeholder="antal reps" className="rounded-xl border px-3 py-2 w-36" value={log.failureReps ?? ''} disabled={isLocked || log.ftApplied}
                              onChange={e=>writeLog(w.id, { ...log, failureReps:Number(e.target.value||0) })} />
                          </div>
                          {!isLocked && !log.ftApplied && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {suggestion === 'increase' && <><span>Föreslagen ändring:</span><span className="font-medium">+2.5 kg</span><span>({selected.workingRmKg} → {proposedUp} kg)</span></>}
                              {suggestion === 'decrease' && <><span>Föreslagen ändring:</span><span className="font-medium">-2.5 kg</span><span>({selected.workingRmKg} → {proposedDown} kg)</span></>}
                              {suggestion === 'hold' && <span>Ingen ändring föreslås för {reps} reps.</span>}
                              <button className={`${BTN_BASE} ${suggestion==='decrease'?BTN_BAD:BTN_GOOD}`} onClick={()=>confirmFailure(w.id)} disabled={typeof reps!=="number" || Number.isNaN(reps)}>Bekräfta</button>
                            </div>
                          )}
                          {(isLocked || log.ftApplied) && (
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>Detta pass är låst – inga ändringar tillåtna.</span>
                              {log.ftApplied && <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>undoFailure(w.id)}>Ångra FT</button>}
                            </div>
                          )}
                        </div>
                      )}

                      {rows.some(r=>r.kind === "negative") && (
                        <div className="mt-3 text-xs text-slate-600">Negativt set: tung excentrisk 1x1 (~{Math.round(getPercentsForWorkout(w.id)[2]*100)}% av 1RM). Träna säkert med spotter.</div>
                      )}
                      {rows.some(r=>r.kind === "max") && (
                        <div className="mt-3 text-xs text-slate-600">Max-test: försök nytt 1RM.</div>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="rounded-2xl border shadow-sm bg-white p-4 text-sm text-slate-600">
                <h3 className="font-semibold mb-2">Tips och upplägg</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Två bänkpass per vecka, 14 totalt.</li>
                  <li>FT-dagar styr arbets-1RM (±2.5 kg). Negativ-dagar ligger över ~110% av 1RM.</li>
                  <li>Vikter beräknas från ditt arbets-1RM och avrundas till valda kg-steg.</li>
                  <li>Sista passet siktar runt 115% av start-1RM; FT-utfall justerar vidare.</li>
                </ul>
              </div>
            </>
          )}
        </section>
      </main>

      {historyOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={()=>setHistoryOpen(false)}>
          <div className="absolute right-4 top-16 w-[min(90vw,520px)] bg-white border shadow-xl rounded-2xl p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Snapshots (server)</h3>
              <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setHistoryOpen(false)}>Stäng</button>
            </div>
            {historyBusy ? (
              <div className="text-sm text-slate-600">Hämtar…</div>
            ) : (
              <div className="max-h-[60vh] overflow-auto divide-y">
                {historyItems.length === 0 ? (
                  <div className="text-sm text-slate-500">Ingen historik hittad.</div>
                ) : historyItems.map((it) => (
                  <div key={it.pathname} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.pathname.split('/').pop()}</div>
                      <div className="text-xs text-slate-500">{it.uploadedAt ? new Date(it.uploadedAt).toLocaleString() : '—'} · {it.size ? `${(it.size/1024).toFixed(1)} kB` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={it.url} target="_blank" rel="noreferrer" className={`${BTN_BASE} ${BTN_SUBTLE}`}>Visa</a>
                      <button className={`${BTN_BASE} ${BTN_GOOD}`} onClick={()=>restoreSnapshot(it)}>Återställ lokalt</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-xl border bg-white text-slate-900 px-4 py-3 shadow-lg min-w-[260px] flex items-start gap-2">
            <span className="text-xl">🎉</span>
            <div className="text-sm leading-snug">
              <div className="font-semibold">{toast.type === 'up' ? 'Grattis!' : 'Notis'}</div>
              <div>{toast.msg}</div>
            </div>
          </div>
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        <div className="mt-6">Rev: {meta?.rev || 0} · Senast sparad: {meta?.lastSavedAt ? new Date(meta.lastSavedAt).toLocaleString() : '–'} · Device: {deviceId.slice(0,8)}…</div>
      </footer>
    </div>
  );
}

