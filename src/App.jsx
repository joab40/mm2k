// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getQuote } from "./quotes.js";

export const APP_VERSION = "v2025.12.25-17";

/* ───────────────────────── helpers ───────────────────────── */
const uid = () => Math.random().toString(36).slice(2);
const roundTo = (v, step = 2.5) => Math.round(v / step) * step;
const safeNum = (n) => (Number.isFinite(+n) ? +n : 0);

const ACCOUNTS_KEY = "mm2k_accounts";
const CURRENT_ACCOUNT_KEY = "mm2k_current_account";
function saveAccounts(list){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
function loadAccounts(){ try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||"[]"); } catch { return []; } }
function saveUsers(accountId, list){ localStorage.setItem(`mm2k_users_${accountId}`, JSON.stringify(list)); }
function loadUsers(accountId){ try{ return JSON.parse(localStorage.getItem(`mm2k_users_${accountId}`)||"[]"); } catch { return []; } }

async function safeJson(r){ try{ const ct=r.headers?.get?.("content-type")||""; return ct.includes("application/json")? await r.json(): null; } catch { return null; } }

/* ───────────────────── stjärnor (FT) ────────────────────── */
function starFromReps(reps){
  if (typeof reps !== "number" || Number.isNaN(reps)) return "none";
  if (reps >= 8) return "gold";
  if (reps >= 4) return "silver";
  return "bronze";
}
function renderStar(kind, key) {
  const dim = "opacity-25";
  if (kind === "gold") return <span key={key} title="FT ≥ 8">⭐️</span>;
  if (kind === "silver") return <span key={key} title="FT 4–7">✨</span>;
  if (kind === "bronze") return <span key={key} title="FT ≤ 3">🌟</span>;
  return <span key={key} className={dim} title="Ej gjort">⭐️</span>;
}

/* ─────────────── MM2K: Workout 1–14 (huvudsätt) ───────────────
  Obs: Vi injicerar uppvärmning dynamiskt, så varje pass får
  alltid 4–6 rader i tabellen även om programmet bara har 1–2
  huvudsätt. FT-dagar styr viktjustering (±2.5 kg).
-----------------------------------------------------------------*/
const PROGRAM = [
  { id:"W1",  name:"Workout 1",  blocks:[{r:8,p:0.70},{r:6,p:0.75},{r:4,p:0.80}] },
  { id:"W2",  name:"Workout 2 (negativt)", blocks:[{r:1,p:1.10,neg:true}] },
  { id:"W3",  name:"Workout 3",  blocks:[{r:5,p:0.80},{r:3,p:0.85}] },
  { id:"W4",  name:"Workout 4 (Failure Test)", blocks:[{r:3,p:0.80},{r:"FT",p:0.80,ft:true}] },
  { id:"W5",  name:"Workout 5",  blocks:[{r:5,p:0.82},{r:3,p:0.87}] },
  { id:"W6",  name:"Workout 6 (Failure Test)", blocks:[{r:3,p:0.82},{r:"FT",p:0.82,ft:true}] },
  { id:"W7",  name:"Workout 7",  blocks:[{r:3,p:0.85},{r:2,p:0.90}] },
  { id:"W8",  name:"Workout 8 (Failure Test)", blocks:[{r:2,p:0.85},{r:"FT",p:0.85,ft:true}] },
  { id:"W9",  name:"Workout 9",  blocks:[{r:2,p:0.90},{r:1,p:0.95}] },
  { id:"W10", name:"Workout 10 (Failure Test)", blocks:[{r:1,p:0.90},{r:"FT",p:0.90,ft:true}] },
  { id:"W11", name:"Workout 11 (negativt)", blocks:[{r:1,p:1.10,neg:true}] },
  { id:"W12", name:"Workout 12 (Failure Test)", blocks:[{r:1,p:0.92},{r:"FT",p:0.92,ft:true}] },
  { id:"W13", name:"Workout 13 (tung single)", blocks:[{r:1,p:1.00}] },
  { id:"W14", name:"Workout 14 (max-test)", blocks:[{r:1,p:1.15,max:true}] },
];
// vilka är FT för stjärnorna/prognosen:
const FT_IDS = PROGRAM.filter(w => w.blocks.some(b => b.ft)).map(w => w.id);

/* Bygger huvudsätt (utan uppvärmning) för en användare */
function buildPrimaryRows(user, workout){
  const base = user?.workingRmKg || user?.oneRmKg || 0;
  const step = user?.rounding || 2.5;
  return workout.blocks.map((b, i) => ({
    label: b.ft ? (i === 0 ? "Block 1" : "Failure Test") : b.neg ? "Negativt 1×1" : b.max ? "Max-test 1×1" : `Block ${i+1}`,
    reps: b.ft ? "FT" : b.r,
    targetKg: roundTo(base * b.p, step),
    kind: b.ft ? "failure" : b.neg ? "negative" : b.max ? "max" : "work",
  }));
}

/* Lägger till uppvärmningsset framför huvudsätten */
function injectWarmups(user, rows){
  const out = [];
  const base = user?.workingRmKg || user?.oneRmKg || 0;
  if (base <= 0) return rows.slice();

  // uppvärmning baserat på tyngsta huvudsättet
  const top = rows.reduce((m,r)=> Math.max(m, r.targetKg||0), 0);
  const plan = [
    { label:"Uppv. 1", reps:5, p:0.50 },
    { label:"Uppv. 2", reps:3, p:0.60 },
    { label:"Uppv. 3", reps:2, p:0.70 },
  ];
  if (top >= base*0.85) plan.push({ label:"Uppv. 4", reps:1, p:0.80 });

  for (const w of plan){
    const kg = roundTo(base*w.p, user.rounding||2.5);
    // undvik dubletter om första huvudsätt råkar vara samma kg
    if (!rows.some(r => r.targetKg === kg && String(r.reps) === String(w.reps))) {
      out.push({ label:w.label, reps:w.reps, targetKg:kg, kind:"warmup" });
    }
  }
  return [...out, ...rows];
}

/* ───────────────────── huvudkomponent ───────────────────── */
export default function App(){
  // konton/profiler
  const [accounts, setAccounts] = useState(loadAccounts());
  const [accountId, setAccountId] = useState(()=> localStorage.getItem(CURRENT_ACCOUNT_KEY) || (loadAccounts()[0]?.id || null));
  const [users, setUsers] = useState(()=> accountId ? loadUsers(accountId) : []);
  const [selectedId, setSelectedId] = useState(()=> users[0]?.id || null);
  const [meta, setMeta] = useState({ rev:0, lastSavedAt:null });

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // historik/admin
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInHistory, setAdminInHistory] = useState(false);

  // se till att alla /api/admin/* går med cookies
  useEffect(()=>{
    if (typeof window !== "undefined" && !window.__mm2kFetchPatched) {
      const orig = window.fetch.bind(window);
      window.fetch = (input, init={})=>{
        try {
          const url = typeof input === "string" ? input : (input && input.url) || "";
          if (url.startsWith("/api/admin/")) init = { credentials:"include", ...init };
        } catch {}
        return orig(input, init);
      };
      window.__mm2kFetchPatched = true;
    }
  },[]);

  useEffect(()=>{ if (accountId){ localStorage.setItem(CURRENT_ACCOUNT_KEY, accountId); const list=loadUsers(accountId); setUsers(list); setSelectedId(list[0]?.id||null);} },[accountId]);
  useEffect(()=>{ if (accountId) saveUsers(accountId, users); },[accountId, users]);

  const selected = useMemo(()=> users.find(u=>u.id===selectedId) || null, [users, selectedId]);

  // prognos (115% + FT-påslag)
  const projected = useMemo(()=>{
    if (!selected) return null;
    const base = roundTo((selected.oneRmKg||0) * 1.15, 0.5);
    let delta = 0;
    for (const id of FT_IDS) {
      const reps = selected.logs?.[id]?.failureReps;
      if (typeof reps !== "number") continue;
      if (reps >= 8) delta += 2.5;
      else if (reps <= 3) delta -= 2.5;
    }
    const remaining = FT_IDS.filter(id => !selected.logs?.[id]?.ftApplied).length;
    return { base, delta, min: base + delta - 2.5*remaining, max: base + delta + 2.5*remaining, remaining };
  },[selected]);

  // CRUD
  function updateSelected(patch){ setUsers(prev=> prev.map(u=> u.id===selectedId ? ({...u, ...patch}) : u)); }
  function addUser(){
    const u = { id:uid(), name:"Athlete 1", startDate:new Date().toISOString().slice(0,10), oneRmKg:100, workingRmKg:100, rounding:2.5, logs:{}, notes:"" };
    setUsers(p=>[...p,u]); setSelectedId(u.id);
  }
  function removeUser(id){ setUsers(p=>p.filter(u=>u.id!==id)); if (id===selectedId) setSelectedId(null); }
  function writeLog(workoutId, log){ setUsers(prev=> prev.map(u=> u.id!==selectedId ? u : ({...u, logs:{ ...(u.logs||{}), [workoutId]: log }}))); }

  // rader för ett visst pass (med uppvärmning)
  function getDisplayRows(wid){
    const w = PROGRAM.find(x=>x.id===wid);
    if (!w || !selected) return [];
    const primary = buildPrimaryRows(selected, w);
    return injectWarmups(selected, primary);
  }

  function markDone(workoutId, done){
    if (!selected) return;
    const current = selected.logs?.[workoutId] || { sets:[] };
    if (done && !current.lockedRows) current.lockedRows = getDisplayRows(workoutId);
    current.done = !!done; current.doneAt = done ? new Date().toISOString() : null;
    writeLog(workoutId, current);
  }

  // FT – bekräfta/ångra (låser passet automatiskt vid bekräfta)
  function confirmFailure(workoutId){
    const log = selected?.logs?.[workoutId] || {};
    const reps = log.failureReps;
    if (typeof reps !== "number" || Number.isNaN(reps)) { alert("Fyll i antal reps för Failure Test."); return; }
    if (log.ftApplied) return;

    let delta = 0;
    if (reps >= 8) delta = +2.5;
    else if (reps <= 3) delta = -2.5;

    const next = roundTo(selected.workingRmKg + delta, 0.5);
    updateSelected({ workingRmKg: next });
    writeLog(workoutId, { ...log, ftApplied:true, ftDelta:delta });

    const q = getQuote(delta>0? "gold" : delta<0? "bronze" : "silver");
    setToast({ type:"quote", msg:q.title, sub:q.text });

    markDone(workoutId, true);
  }
  function undoFailure(workoutId){
    const log = selected?.logs?.[workoutId] || {};
    if (!log.ftApplied) return;
    const next = roundTo(selected.workingRmKg - (log.ftDelta||0), 0.5);
    updateSelected({ workingRmKg: next });
    writeLog(workoutId, { ...log, ftApplied:false, ftDelta:0 });
  }

  /* ────────────── spara/ladda profil (server) ────────────── */
  async function saveRemoteProfile(){
    if (!accountId) return;
    const acc = accounts.find(a=>a.id===accountId);
    const blobKey = acc?.blobKey || acc?.id;

    setBusy(true);
    try{
      const profileMeta = { rev:(meta?.rev||0)+1, lastSavedAt:new Date().toISOString() };
      const body = { blobKey, profile:{ users, profileMeta } }; // VIKTIGT: matchar din backend
      const r = await fetch("/api/profiles/save", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify(body),
      });
      const j = await safeJson(r);
      if (r.ok){ setMeta(j?.profileMeta || profileMeta); setToast({type:"up", msg:"Sparat till server"}); }
      else alert(j?.error || "Spara misslyckades");
    } finally { setBusy(false); }
  }
  async function loadRemoteProfile(){
    if (!accountId) return;
    const acc = accounts.find(a=>a.id===accountId);
    const blobKey = acc?.blobKey || acc?.id;

    setBusy(true);
    try{
      const r = await fetch(`/api/profiles/load?key=${blobKey}`);
      const j = await safeJson(r);
      if (r.ok){ if (Array.isArray(j?.users)) setUsers(j.users); if (j?.profileMeta) setMeta(j.profileMeta); setToast({type:"up", msg:"Laddat från server"}); }
      else alert(j?.error || "Ladda misslyckades");
    } finally { setBusy(false); }
  }
  async function syncNow(){
    if (!accountId) return;
    const acc = accounts.find(a=>a.id===accountId);
    const blobKey = acc?.blobKey || acc?.id;

    setBusy(true);
    try{
      const r = await fetch(`/api/profiles/load?key=${blobKey}`);
      if (r.ok){
        const j = await safeJson(r);
        const rRev = j?.profileMeta?.rev || 0;
        const lRev = meta?.rev || 0;
        if (rRev > lRev){ if (Array.isArray(j?.users)) setUsers(j.users); if (j?.profileMeta) setMeta(j.profileMeta); setToast({type:"up", msg:"Synk: hämtade från server"}); }
        else if (rRev < lRev){ await saveRemoteProfile(); }
        else setToast({type:"note", msg:"Synk: inget att göra"});
      } else {
        await saveRemoteProfile();
      }
    } finally { setBusy(false); }
  }

  // Historik (snapshots)
  async function openHistory(){
    if (!accountId) return;
    const acc = accounts.find(a=>a.id===accountId);
    const blobKey = acc?.blobKey || acc?.id;
    setHistoryOpen(true); setAdminInHistory(false); setHistoryBusy(true);
    try{
      const r = await fetch(`/api/profiles/history?key=${blobKey}`);
      const j = await safeJson(r);
      setHistoryItems(Array.isArray(j?.items)? j.items : []);
    } finally { setHistoryBusy(false); }
  }
  async function restoreSnapshot(item){
    try{
      const r = await fetch(item.url);
      if (!r.ok) throw new Error("Kunde inte hämta snapshot");
      const j = await r.json();
      if (Array.isArray(j?.users)) setUsers(j.users);
      if (j?.profileMeta) setMeta(j.profileMeta);
      setToast({ type:"up", msg:"Återställde snapshot lokalt (spara för att skriva över servern)" });
    } catch(e){ alert(String(e?.message||e)); }
  }

  // Admin-login (med retry)
  async function adminLogin(){
    const code = window.prompt("Admin kod (6 siffror):");
    if (!code) return false;
    try{
      const r = await fetch("/api/admin/login", {
        method:"POST", headers:{ "content-type":"application/json" },
        body: JSON.stringify({ code }), credentials:"include",
      });
      if (r.status===204 || r.ok){
        await new Promise(r=>setTimeout(r,200));
        const p1 = await fetch("/api/admin/profiles",{credentials:"include"});
        if (p1.ok){ setIsAdmin(true); setToast({type:"up", msg:"Adminläge aktiverat"}); return true; }
        await new Promise(r=>setTimeout(r,300));
        const p2 = await fetch("/api/admin/profiles",{credentials:"include"});
        if (p2.ok){ setIsAdmin(true); setToast({type:"up", msg:"Adminläge aktiverat"}); return true; }
        const j = await safeJson(p2); alert("Admin-listning misslyckades: " + (j?.error || `${p2.status}`)); return false;
      }
      const j = await safeJson(r); alert("Fel kod: " + (j?.error || `${r.status}`)); return false;
    } catch { alert("Nätverksfel vid admin-login"); return false; }
  }
  async function adminLogout(){
    try{
      await fetch("/api/admin/login", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ logout:true }), credentials:"include" });
    } finally { setIsAdmin(false); setAdminInHistory(false); }
  }

  // kontomeny
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [linkPanel, setLinkPanel] = useState(false);
  const activeAcc = accounts.find(a=>a.id===accountId);
  const shareLink = activeAcc ? `${location.origin}${location.pathname}?k=${activeAcc.blobKey||activeAcc.id}` : "";
  const copyShareLink = ()=>{ navigator.clipboard?.writeText(shareLink); setToast({type:"up", msg:"Delningslänk kopierad"}); };

  function createAccount(){
    const id = uid();
    const acc = { id, label:"Profil", pin:"", blobKey:id };
    const list = [...accounts, acc];
    setAccounts(list); saveAccounts(list); setAccountId(id);
  }
  function switchAccount(a){ setAccountId(a.id); setShowAccountPanel(false); }
  function deleteAccount(id){
    if (!confirm("Ta bort profilen lokalt?")) return;
    setAccounts(prev=>{ const n=prev.filter(a=>a.id!==id); saveAccounts(n); return n; });
    if (accountId===id) setAccountId(null);
  }

  /* ───────────────────────── UI ───────────────────────── */
  if (!accountId){
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-900 p-6">
        <div className="w-full max-w-xl bg-white border rounded-2xl shadow-lg p-6">
          <div className="text-center mb-4">
            <div className="text-3xl font-extrabold flex items-center justify-center gap-3"><LiftEmoji/> MM2K Bench</div>
            <div className="text-slate-600">Skapa eller välj profil</div>
          </div>
          <div className="space-y-3">
            <button className={`${BTN_BASE} ${BTN_SOLID} w-full`} onClick={createAccount}>+ Ny profil</button>
            {accounts.length>0 && (
              <ul className="space-y-2">
                {accounts.map(a=>(
                  <li key={a.id} className="flex items-center justify-between border rounded-xl p-2">
                    <div>
                      <div className="font-medium">{a.label}</div>
                      <div className="text-xs text-slate-500">Blob-ID: {(a.blobKey||a.id).slice(0,8)}…</div>
                    </div>
                    <div className="flex gap-2">
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>switchAccount(a)}>Välj</button>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>deleteAccount(a.id)}>Ta bort</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-3">Profiler sparas lokalt i webbläsaren.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200">
        <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-sky-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <LiftEmoji/>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">MM2K Bench</h1>
                <p className="text-sm text-white/95">6 veckor, 14 pass, FT-stjärnor, historik + admin via historik</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button disabled={busy} onClick={syncNow} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy? "Synkar…" : "Synk nu"}</button>
              <button disabled={busy} onClick={saveRemoteProfile} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy? "Sparar…" : "Spara till server"}</button>
              <button disabled={busy} onClick={loadRemoteProfile} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy? "Laddar…" : "Ladda från server"}</button>
              <button onClick={openHistory} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Historik</button>

              <div className="relative">
                <button onClick={()=>setShowAccountPanel(v=>!v)} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Profil: {activeAcc?.label||"—"}</button>
                {showAccountPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-white text-slate-900 rounded-xl shadow-lg border p-2">
                    <div className="px-2 py-1 text-xs text-slate-500">Profiler</div>
                    <ul className="max-h-60 overflow-auto">
                      {accounts.map(a=>(
                        <li key={a.id} className="flex items-center justify-between rounded-lg hover:bg-slate-50 px-2 py-1">
                          <button className="text-left" onClick={()=>switchAccount(a)}>
                            <div className="font-medium">{a.label}</div>
                            <div className="text-xs text-slate-500">Blob-ID: {(a.blobKey||a.id).slice(0,8)}…</div>
                          </button>
                          <button className="text-slate-500 hover:text-rose-600" onClick={()=>deleteAccount(a.id)} title="Ta bort">✕</button>
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
            {users.map(u=>(
              <li key={u.id} className={`flex items-center justify-between rounded-xl px-2 py-1 ${selectedId===u.id? "bg-slate-100":""}`}>
                <button onClick={()=>setSelectedId(u.id)} className="text-left grow">
                  <div className="font-medium">{u.name||"Namnlös"}</div>
                  <div className="text-xs text-slate-500">1RM: {u.oneRmKg} kg · Arbets-1RM: {u.workingRmKg} kg</div>
                </button>
                <button onClick={()=>removeUser(u.id)} className="text-slate-500 hover:text-rose-600" title="Ta bort">✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <button onClick={addUser} className={`${BTN_BASE} ${BTN_SOLID} w-full`}>+ Ny användare</button>
          </div>
          <div className="mt-3 text-xs text-slate-500 border rounded-xl p-2">
            <div>Rev: <span className="font-medium">{meta?.rev||0}</span></div>
            <div>Senast sparad: {meta?.lastSavedAt? new Date(meta.lastSavedAt).toLocaleString() : "–"}</div>
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
                    <input className="rounded-xl border px-3 py-2" value={selected.name} onChange={e=>updateSelected({name:e.target.value})}/>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Startdatum</span>
                    <input type="date" className="rounded-xl border px-3 py-2" value={selected.startDate} onChange={e=>updateSelected({startDate:e.target.value})}/>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">1RM (kg)</span>
                    <input type="number" className="rounded-xl border px-3 py-2" value={selected.oneRmKg} onChange={e=>{ const v=safeNum(e.target.value); updateSelected({oneRmKg:v, workingRmKg:v}); }}/>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Arbets-1RM (kg)</span>
                    <div className="flex gap-2">
                      <input type="number" className="rounded-xl border px-3 py-2 grow" value={selected.workingRmKg} onChange={e=>updateSelected({workingRmKg:safeNum(e.target.value)})}/>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>updateSelected({workingRmKg:selected.oneRmKg})}>Reset</button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Avrundning (kg-steg)</span>
                    <select className="rounded-xl border px-3 py-2" value={selected.rounding} onChange={e=>updateSelected({rounding:Number(e.target.value)})}>
                      {[1,1.25,2,2.5,5].map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>

                  <div className="md:col-span-2">
                    <div className="rounded-xl border p-3 bg-slate-50 text-sm">
                      {projected ? (
                        <>
                          <div className="font-medium">Prognos 1RM efter #14:</div>
                          <div>Bas (115% av start): <span className="font-medium">{roundTo(selected.oneRmKg*1.15, 0.5)} kg</span></div>
                          <div>Uppnått via Failure-test: <span className="font-medium">{projected.delta>=0? "+":""}{projected.delta} kg</span></div>
                          <div className="mt-1">Intervall: <span className="font-semibold">{projected.min} – {projected.max} kg</span> (återstår {projected.remaining} FT)</div>
                        </>
                      ) : "Ingen prognos tillgänglig."}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="rounded-xl border p-3 bg-white text-sm flex items-center justify-between">
                      <div className="font-medium">Failure-stjärnor</div>
                      <div className="flex gap-1 text-xl">{FT_IDS.map((id)=> renderStar(starFromReps(selected.logs?.[id]?.failureReps), id))}</div>
                    </div>
                  </div>

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-sm text-slate-600">Anteckningar</span>
                    <textarea rows={2} className="rounded-xl border px-3 py-2" value={selected.notes||""} onChange={e=>updateSelected({notes:e.target.value})}/>
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={()=>updateSelected({logs:{}})} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Rensa loggar</button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {PROGRAM.map(w=>{
                  const log = selected.logs?.[w.id] || { sets:[], done:false, failureReps:undefined };
                  const displayRows = (log.done && log.lockedRows?.length) ? log.lockedRows : getDisplayRows(w.id);
                  const reps = log.failureReps;
                  const suggestion = (typeof reps==="number" && !Number.isNaN(reps))
                    ? (reps>=8? "increase" : (reps<=3? "decrease":"hold")) : null;
                  const proposedUp = roundTo(selected.workingRmKg + 2.5, 0.5);
                  const proposedDown = roundTo(Math.max(0, selected.workingRmKg - 2.5), 0.5);
                  const isLocked = !!log.done;

                  return (
                    <article key={w.id} className={`rounded-2xl border shadow-sm bg-white p-4 ${log.done? "ring-2 ring-green-500/40":""}`}>
                      <header className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold flex items-center gap-2">{w.name}
                            {displayRows.some(r=>r.kind==="failure") && (
                              <span className="text-xl" title={`FT: ${typeof reps==='number'? reps+' reps':'inte gjort'}`}>{renderStar(starFromReps(reps))}</span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-500">Beräknat från arbets-1RM {selected.workingRmKg} kg{log.done && log.doneAt? ` (låst ${new Date(log.doneAt).toLocaleDateString()})`: ""}</p>
                          {log.ftApplied && (
                            <div className="mt-1 inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">
                              FT bekräftad {log.ftDelta>0?`(+${log.ftDelta} kg)`:log.ftDelta<0?`(${log.ftDelta} kg)`:"(±0 kg)"}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>markDone(w.id, !log.done)} className={`${BTN_BASE} ${log.done? BTN_GOOD: BTN_SUBTLE}`}>{log.done? "Klart":"Markera klart"}</button>
                        </div>
                      </header>

                      <table className="w-full text-sm border-separate" style={{borderSpacing:"0 6px"}}>
                        <thead>
                          <tr className="text-left text-slate-500"><th className="font-medium">Set</th><th className="font-medium">Reps</th><th className="font-medium">Rek. vikt</th><th className="font-medium">Logg</th></tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r,idx)=>(
                            <tr key={idx} className="align-top">
                              <td className="py-1 pr-2 whitespace-nowrap">{r.label}</td>
                              <td className="py-1 pr-2">{String(r.reps)}</td>
                              <td className="py-1 pr-2">{r.targetKg} kg{r.kind==="warmup"?" (uppv.)":""}{r.kind==="negative"?" (neg)":""}{r.kind==="max"?" (max)":""}</td>
                              <td className="py-1">
                                <div className="flex gap-2">
                                  <input type="number" placeholder="kg" className="w-24 rounded-xl border px-2 py-1" value={log.sets?.[idx]?.actualKg ?? ""} disabled={isLocked}
                                    onChange={e=>{ const sets=[...(log.sets||[])]; sets[idx]={...(sets[idx]||{}), actualKg:safeNum(e.target.value)}; writeLog(w.id, { ...log, sets }); }}/>
                                  <input type="number" placeholder="reps" className="w-20 rounded-xl border px-2 py-1" value={log.sets?.[idx]?.reps ?? ""} disabled={isLocked}
                                    onChange={e=>{ const sets=[...(log.sets||[])]; sets[idx]={...(sets[idx]||{}), reps:safeNum(e.target.value)}; writeLog(w.id, { ...log, sets }); }}/>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {displayRows.some(r=>r.kind==="failure") && (
                        <div className={`mt-4 rounded-xl ${isLocked? "bg-slate-50 border border-slate-200":"bg-amber-50 border border-amber-200"} p-3`}>
                          <div className="text-sm mb-2 font-medium">Failure Test</div>
                          <p className="text-sm text-slate-600 mb-2">Max reps med FT-vikten ({displayRows.find(r=>r.kind==="failure")?.targetKg} kg). 4–7 reps: ingen ändring. ≤3: −2.5 kg. ≥8: +2.5 kg.</p>
                          <div className="flex items-center gap-2 mb-2">
                            <input type="number" placeholder="antal reps" className="rounded-xl border px-3 py-2 w-36" value={log.failureReps ?? ""} disabled={isLocked || log.ftApplied}
                              onChange={e=>writeLog(w.id, { ...log, failureReps:safeNum(e.target.value) })}/>
                          </div>
                          {!isLocked && !log.ftApplied && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {suggestion==='increase' && <><span>Föreslagen ändring:</span><span className="font-medium">+2.5 kg</span><span>({selected.workingRmKg} → {proposedUp} kg)</span></>}
                              {suggestion==='decrease' && <><span>Föreslagen ändring:</span><span className="font-medium">-2.5 kg</span><span>({selected.workingRmKg} → {proposedDown} kg)</span></>}
                              {suggestion==='hold' && <span>Ingen ändring föreslås för {reps} reps.</span>}
                              <button className={`${BTN_BASE} ${suggestion==='decrease'? BTN_BAD: BTN_GOOD}`} onClick={()=>confirmFailure(w.id)} disabled={typeof reps!=="number" || Number.isNaN(reps)}>Bekräfta</button>
                            </div>
                          )}
                          {(isLocked || log.ftApplied) && (
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>{isLocked? "Detta pass är låst – inga ändringar tillåtna." : "FT redan bekräftad."}</span>
                              {log.ftApplied && <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>undoFailure(w.id)}>Ångra FT</button>}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>

      {historyOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={()=>setHistoryOpen(false)}>
          <div className="absolute right-4 top-16 w-[min(90vw,900px)] bg-white border shadow-xl rounded-2xl p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{adminInHistory? "Adminpanel" : "Snapshots (server)"}</h3>
                {isAdmin && (<button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setAdminInHistory(v=>!v)}>{adminInHistory? "Visa historik":"Visa admin"}</button>)}
              </div>
              <div className="flex items-center gap-2">
                {!isAdmin && (<button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={async()=>{ const ok = await adminLogin(); if (ok) setAdminInHistory(true); }}>Admin…</button>)}
                {isAdmin && (<button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={adminLogout}>Logga ut</button>)}
                <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setHistoryOpen(false)}>Stäng</button>
              </div>
            </div>

            {adminInHistory && isAdmin ? (
              <div className="max-h-[70vh] overflow-auto"><AdminPanel/></div>
            ) : historyBusy ? (
              <div className="text-sm text-slate-600">Hämtar…</div>
            ) : (
              <div className="max-h-[70vh] overflow-auto divide-y">
                {historyItems.length===0 ? (
                  <div className="text-sm text-slate-500">Ingen historik hittad.</div>
                ) : historyItems.map(it=>(
                  <div key={it.pathname} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.pathname.split("/").pop()}</div>
                      <div className="text-xs text-slate-500">{it.uploadedAt? new Date(it.uploadedAt).toLocaleString():"—"} · {it.size? `${(it.size/1024).toFixed(1)} kB`: ""}</div>
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
          {toast.type==='quote' ? (
            <div className="rounded-2xl border bg-white text-slate-900 px-5 py-4 shadow-xl min-w-[280px] max-w-[420px]">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🏆</div>
                <div className="leading-snug">
                  <div className="text-lg font-extrabold tracking-tight">{toast.msg}</div>
                  {!!toast.sub && <div className="text-xs text-slate-600 mt-1">{toast.sub}</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-white text-slate-900 px-4 py-3 shadow-lg min-w-[260px] flex items-start gap-2">
              <span className="text-xl">{toast.type==='up'? "🎉":"ℹ️"}</span>
              <div className="text-sm leading-snug">
                <div className="font-semibold">{toast.type==='up'? "Grattis!":"Notis"}</div>
                <div>{toast.msg}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <span>Rev: {meta?.rev||0}</span>
          <span>Senast sparad: {meta?.lastSavedAt? new Date(meta.lastSavedAt).toLocaleString():"–"}</span>
          <span className="ml-auto">App {APP_VERSION}</span>
        </div>
      </footer>
    </div>
  );
}

/* ────────────────────── AdminPanel ────────────────────── */
function AdminPanel(){
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ (async()=>{
    try{
      const r = await fetch("/api/admin/profiles"+(q?`?q=${encodeURIComponent(q)}`:""), { credentials:"include" });
      const j = await r.json().catch(()=>null);
      if (r.ok) setRows(j?.items||[]); else throw new Error(j?.error || `${r.status}`);
    }catch(e){ alert("Admin-listning misslyckades: " + String(e?.message||e)); }
  })(); },[q]);

  async function copyLink(key){
    try{
      const r = await fetch(`/api/admin/sharelink?key=${key}`, { credentials:"include" });
      if (r.ok){ const { link } = await r.json(); await navigator.clipboard?.writeText(link); alert(`Delningslänk kopierad:\n${link}`); return; }
      throw new Error("Kunde inte skapa delningslänk");
    }catch{
      const base = location.origin + location.pathname;
      const link = `${base}?k=${key}`;
      await navigator.clipboard?.writeText(link);
      alert(`Delningslänk kopierad (fallback):\n${link}`);
    }
  }
  async function removeProfile(key){
    if (!confirm("Radera hela profilen (inkl. historik)?")) return;
    const r = await fetch(`/api/admin/profile/${key}`, { method:"DELETE", credentials:"include" });
    if (r.ok || r.status===204){ setRows(rows.filter(x=>x.blobKey!==key)); if (selectedKey===key){ setSelectedKey(null); setSelectedProfile(null);} }
  }
  async function openProfile(key){
    setSelectedKey(key); setLoading(true);
    try{
      const r = await fetch(`/api/admin/profile/${key}`, { credentials:"include" });
      if (!r.ok) throw new Error("Kunde inte läsa profilen");
      const j = await r.json();
      setSelectedProfile(j);
    } catch(e){ alert(String(e?.message||e)); } finally { setLoading(false); }
  }
  async function patch(op, payload){
    if (!selectedKey) return;
    const r = await fetch(`/api/admin/profile/${selectedKey}`, {
      method:"PATCH", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ op, ...payload }), credentials:"include"
    });
    if (r.ok || r.status===204){ await openProfile(selectedKey); }
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold">Admin – profiler</h3>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filtrera..." className="rounded-xl border px-3 py-2"/>
      </div>
      <div className="mt-3 grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-3 max-h-[60vh] overflow-auto">
          {rows.length===0? <div className="text-sm text-slate-500">Inga profiler funna.</div> : rows.map(r=>(
            <div key={r.blobKey} className={`flex items-center justify-between gap-3 py-2 ${selectedKey===r.blobKey? "bg-slate-50 px-2 rounded-lg":""}`}>
              <div className="min-w-0">
                <div className="font-medium truncate">{r.blobKey}</div>
                <div className="text-xs text-slate-500">{r.size} B · {r.uploadedAt}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>copyLink(r.blobKey)}>Delningslänk</button>
                <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>openProfile(r.blobKey)}>Öppna</button>
                <button className={`${BTN_BASE} ${BTN_BAD}`} onClick={()=>removeProfile(r.blobKey)}>Radera</button>
              </div>
            </div>
          ))}
        </div>
        <div className="border rounded-xl p-3">
          {!selectedKey? (
            <div className="text-sm text-slate-500">Välj en profil till vänster.</div>
          ) : loading? (
            <div className="text-sm text-slate-500">Laddar…</div>
          ) : !selectedProfile? (
            <div className="text-sm text-slate-500">Ingen data.</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="font-semibold">Profil: {selectedKey}</div>
              <div className="text-xs text-slate-500">Användare ({selectedProfile.users?.length||0})</div>
              <div className="divide-y">
                {(selectedProfile.users||[]).map(u=>(
                  <div key={u.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.name||"Namnlös"}</div>
                      <div className="text-xs text-slate-500">1RM {u.oneRmKg} · Arb1RM {u.workingRmKg}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ const name=prompt("Nytt namn", u.name||""); if(name!=null) patch("renameUser",{ id:u.id, name}); }}>Byt namn</button>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ const v=Number(prompt("Sätt Arbets-1RM (kg)", u.workingRmKg)); if(!Number.isNaN(v)) patch("setWorkingRm",{ id:u.id, value:v}); }}>Sätt Arb-1RM</button>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ if(confirm("Rensa alla loggar för denna användare?")) patch("resetLogs",{ id:u.id}); }}>Rensa loggar</button>
                      <button className={`${BTN_BASE} ${BTN_BAD}`} onClick={()=>{ if(confirm("Ta bort användaren?")) patch("removeUser",{ id:u.id}); }}>Ta bort</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────── UI-smått ───────────────── */
function LiftEmoji(){ return (<span className="inline-flex items-center justify-center text-3xl select-none" aria-hidden>🏋️‍♂️</span>); }
const BTN_BASE = "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm transition border";
const BTN_SUBTLE = "bg-white/90 hover:bg-white text-slate-700 border-slate-200";
const BTN_SOLID = "bg-white text-slate-900 hover:bg-white/90 border-white";
const BTN_GOOD = "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700";
const BTN_BAD = "bg-rose-600 hover:bg-rose-700 text-white border-rose-700";
