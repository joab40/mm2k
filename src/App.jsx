import React, { useEffect, useMemo, useState } from "react";
import { getQuote } from "./quotes.js";

/************************
 * MM2K Bench – App.jsx (Admin via Historik + robust JSON)
 * - Lokala profiler (PIN, delningskod ?k=...)
 * - Vercel Blob: spara/ladda/synka + historik
 * - 14 pass, Failure Tests (#5,7,9,11,13) med låsning, undo, stjärnor
 * - Popup‑quotes via quotes.js
 * - Admin‑UI nås från Historik (färre knappar i header)
 ************************/

/****************
 * Versionsinfo
 ****************/
export const APP_VERSION = "v2025.12.25-02"; // Öka denna när App.jsx uppdateras

/****************
 * Utils + Keys
 ****************/
const CURRENT_ACCOUNT_KEY = "mm2k_current_account_v3";
const ACCOUNTS_KEY = "mm2k_accounts_v3";
const DEVICE_KEY = "mm2k_device_id_v1";

const USERS_KEY = (accId) => `mm2k_users_${accId}_v3`;
const META_KEY = (accId) => `mm2k_meta_${accId}_v3`;

function uid() { return Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10); }
function generateOpaqueKey() { return uid(); }
function getDeviceId() { let id=localStorage.getItem(DEVICE_KEY); if(!id){ id=uid(); localStorage.setItem(DEVICE_KEY,id);} return id; }
function roundTo(x, step = 0.5) { const s=Number(step)||0.5; return Math.round((Number(x)||0)/s)*s; }

function saveAccounts(list){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
function loadAccounts(){ try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||"[]"); } catch { return []; } }
function saveUsers(accountId, users){ if(!accountId) return; localStorage.setItem(USERS_KEY(accountId), JSON.stringify(users)); }
function loadUsers(accountId){ if(!accountId) return []; try{ return JSON.parse(localStorage.getItem(USERS_KEY(accountId))||"[]"); } catch{ return []; } }
function saveMeta(accountId, meta){ if(!accountId) return; localStorage.setItem(META_KEY(accountId), JSON.stringify(meta)); }
function loadMeta(accountId){ if(!accountId) return {}; try{ return JSON.parse(localStorage.getItem(META_KEY(accountId))||"{}"); } catch{ return {}; } }

function todayISO(){ return new Date().toISOString().slice(0,10); }

// Robust JSON-läsare som ger vettigt fel vid Vite-dev utan serverless
async function safeJson(res){
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ct.includes('application/json')) {
    try { return JSON.parse(text); } catch { throw new Error('Ogiltig JSON från servern.'); }
  }
  const head = (text || '').trim().slice(0, 160);
  throw new Error(head || 'Svaret var inte JSON. Kör "vercel dev" lokalt eller använd den deployade Vercel-URL:en – Admin kräver serverless-API.');
}

/****************
 * Programlayout + setbygge
 ****************/
const WORKOUTS = [
  { id: 1, name: "#1 – Bas A" },
  { id: 2, name: "#2 – Bas B" },
  { id: 3, name: "#3 – Fart/Volym" },
  { id: 4, name: "#4 – Tung singel" },
  { id: 5, name: "#5 – Failure Test" },
  { id: 6, name: "#6 – Negativ (excentrisk)" },
  { id: 7, name: "#7 – Failure Test" },
  { id: 8, name: "#8 – Bas tung" },
  { id: 9, name: "#9 – Failure Test" },
  { id: 10, name: "#10 – Negativ (excentrisk)" },
  { id: 11, name: "#11 – Failure Test" },
  { id: 12, name: "#12 – Bas tung" },
  { id: 13, name: "#13 – Failure Test" },
  { id: 14, name: "#14 – Max‑test" },
];

function buildPrescription(workoutId, workingRmKg, step){
  const w = Number(workingRmKg)||0;
  const f = (p)=> roundTo(w*p, step);
  const rows = [];
  const add = (label, reps, pct, kind="normal") => rows.push({ label, reps, targetKg: f(pct), kind });

  switch(workoutId){
    case 1: add("Block 1",3,0.80); add("Block 2",8,0.70); add("Back‑off",8,0.65); break;
    case 2: add("Block 1",2,0.85); add("Block 2",6,0.75); add("Back‑off",6,0.70); break;
    case 3: add("Block 1",3,0.65); add("Block 2",6,0.70); add("Back‑off",8,0.65); break;
    case 4: add("Block 1",1,0.90); add("Block 2",5,0.75); add("Back‑off",5,0.70); break;
    case 5: case 7: case 9: case 11: case 13:
      add("Block 1",2,0.87); add("Block 2",5,0.75); rows.push({ label:"Failure (AMRAP)", reps:"AMRAP", targetKg:f(0.75), kind:"failure"}); break;
    case 6: case 10:
      add("Block 1",3,0.85); add("Block 2",3,0.80); rows.push({ label:"Negativ 1x1", reps:1, targetKg: roundTo(w*1.10, step), kind:"negative"}); break;
    case 8: case 12: add("Block 1",2,0.88); add("Block 2",4,0.78); add("Back‑off",6,0.72); break;
    case 14: add("Uppvärmning",1,0.90); rows.push({ label:"Max‑försök ~115%", reps:1, targetKg: roundTo(w*1.15, step), kind:"max"}); break;
    default: add("Block 1",3,0.8); add("Block 2",6,0.75); break;
  }
  return rows;
}

/****************
 * Failure Test logik
 ****************/
const FT_IDS = [5,7,9,11,13];
function calcFtDelta(reps){ if(!Number.isFinite(reps)) return 0; if(reps>=8) return 2.5; if(reps<=3) return -2.5; return 0; }
function starFromReps(val){ const n=Number(val); if(!Number.isFinite(n)) return "none"; if(n>=8) return "gold"; if(n>=4) return "silver"; return "bronze"; }
function renderStar(kind, key){ switch(kind){ case "gold": return <span key={key} className="text-amber-500">★</span>; case "silver": return <span key={key} className="text-slate-400">★</span>; case "bronze": return <span key={key} className="text-orange-600">★</span>; default: return <span key={key} className="text-slate-300/60">☆</span>; } }

/****************
 * App
 ****************/
export default function App(){
  // Accounts
  const [accounts, setAccounts] = useState(loadAccounts());
  const [accountId, setAccountId] = useState(()=> localStorage.getItem(CURRENT_ACCOUNT_KEY) || (loadAccounts()[0]?.id || null));
  useEffect(()=>{ saveAccounts(accounts); },[accounts]);
  useEffect(()=>{ if(accountId) localStorage.setItem(CURRENT_ACCOUNT_KEY, String(accountId)); },[accountId]);

  // Ensure blobKey exists
  useEffect(()=>{ const next = accounts.map(a=> a.blobKey? a : { ...a, blobKey: generateOpaqueKey()}); if(JSON.stringify(next)!==JSON.stringify(accounts)) setAccounts(next); /*eslint-disable-next-line*/ },[]);

  // Device
  const deviceId = useMemo(()=> getDeviceId(), []);

  // Users + Meta
  const [users, setUsers] = useState(()=> loadUsers(accountId));
  const [meta, setMeta] = useState(()=> loadMeta(accountId));
  useEffect(()=>{ setUsers(loadUsers(accountId)); setMeta(loadMeta(accountId)); },[accountId]);
  useEffect(()=>{ if(accountId) saveUsers(accountId, users); },[users, accountId]);
  useEffect(()=>{ if(accountId) saveMeta(accountId, meta); },[meta, accountId]);

  // Selected user
  const [selectedId, setSelectedId] = useState(()=> users[0]?.id || null);
  useEffect(()=>{ setSelectedId(users[0]?.id || null); },[users]);
  const selected = useMemo(()=> users.find(u=>u.id===selectedId) || null, [users, selectedId]);

  // UI state
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [linkPanel, setLinkPanel] = useState(false);
  const [linkCode, setLinkCode] = useState("");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInHistory, setAdminInHistory] = useState(false);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null), 3000); return ()=>clearTimeout(t); },[toast]);

  // Prescriptions for selected
  const prescriptions = useMemo(()=>{ if(!selected) return {}; const out={}; for(const w of WORKOUTS) out[w.id]=buildPrescription(w.id, selected.workingRmKg, selected.rounding); return out; },[selected]);

  // Projected 1RM range after #14
  const projected = useMemo(()=>{
    if(!selected) return null;
    const base = roundTo(selected.oneRmKg*1.15, 0.5);
    let delta=0, completed=0;
    for(const id of FT_IDS){ const log=selected.logs?.[id]; if(log?.done){ completed++; if(log.ftApplied) delta += Number(log.ftDelta||0); else if(Number.isFinite(log?.failureReps)) delta += calcFtDelta(Number(log.failureReps)); } }
    const remaining = FT_IDS.length - completed;
    const point = roundTo(base + delta, 0.5);
    return { min: roundTo(point - 2.5*remaining, 0.5), max: roundTo(point + 2.5*remaining, 0.5), point, delta, remaining };
  },[selected]);

  // Quotes popup
  function showQuote(kind, extraLine=""){ const q=getQuote(kind); const main=q?.text||""; const sub=q?.author?`— ${q.author}`: (extraLine||""); setToast({ type:"quote", msg:main, sub }); }

  // Account helpers
  function NEW_USER(){ const base=100, rounding=2.5; return { id:uid(), name:`Athlete ${users.length+1}`, startDate:todayISO(), oneRmKg:base, workingRmKg:base, rounding, logs:{}, notes:"" }; }
  function addUser(){ if(!accountId) return; const u=NEW_USER(); setUsers(prev=>[...prev,u]); setSelectedId(u.id); }
  function updateSelected(patch){ setUsers(prev=> prev.map(u=> (u.id===selectedId? { ...u, ...patch } : u))); }
  function removeUser(id){ const next=users.filter(u=>u.id!==id); setUsers(next); if(selectedId===id) setSelectedId(next[0]?.id||null); }
  function resetLogs(){ if(!selected) return; if(!window.confirm("Rensa alla loggar?")) return; updateSelected({ logs:{} }); }

  function extractBlobKeyFromInput(input){ const raw=String(input||'').trim(); if(!raw) return null; if(/^[A-Za-z0-9_-]{12,}$/.test(raw)) return raw; try{ const u=new URL(raw); const k=u.searchParams.get('k'); if(k && /^[A-Za-z0-9_-]{12,}$/.test(k)) return k; const m=u.pathname.match(/\/profiles\/([A-Za-z0-9_-]{12,})\//); if(m&&m[1]) return m[1]; } catch{} const m2=raw.match(/profiles\/([A-Za-z0-9_-]{12,})\//); if(m2&&m2[1]) return m2[1]; const s=raw.replace(/\.json($|\?.*)/,''); const parts=s.split(/[?#/]/).filter(Boolean); const c=parts[parts.length-1]||''; if(/^[A-Za-z0-9_-]{12,}$/.test(c)) return c; return null; }

  async function createAccount(){ const label=window.prompt("Profilnamn (t.ex. Vide)")||"Profil"; const maybe=window.prompt("Delningskod/länk (valfritt) ")||""; let blobKey=null; if(maybe.trim()){ blobKey=extractBlobKeyFromInput(maybe); if(!blobKey) alert("Koden/länken kunde inte tolkas."); } const pin=window.prompt("Valfri PIN (tom = ingen)")||""; const acc={ id:uid(), label, pin: pin.trim()? pin.trim(): null, blobKey: blobKey||generateOpaqueKey(), createdAt:new Date().toISOString()}; const next=[...accounts, acc]; setAccounts(next); setAccountId(acc.id); if(blobKey){ try{ const r=await fetch(`/api/profiles/${blobKey}`); if(r.ok){ const data=await safeJson(r); if(Array.isArray(data.users)) setUsers(data.users); if(data.profileMeta) setMeta(data.profileMeta); setToast({ type:'up', msg:'Profil kopplad och laddad från server.'}); } } catch(e){ alert(e.message);} }
  }
  function deleteAccount(id){ if(!window.confirm("Ta bort profilen?")) return; const next=accounts.filter(a=>a.id!==id); setAccounts(next); if(accountId===id) setAccountId(next[0]?.id||null); }
  function switchAccount(a){ if(a.pin){ const entered=window.prompt("Ange PIN")||""; if(entered!==a.pin){ alert("Fel PIN"); return; } } setAccountId(a.id); setShowAccountPanel(false); }
  function signOut(){ setAccountId(null); setShowAccountPanel(false); }

  async function connectWithCodeFlow(prefilled){ const input= typeof prefilled==='string'? prefilled : window.prompt('Klistra in delningskod eller länk (?k=)'); if(!input) return; const key=extractBlobKeyFromInput(input); if(!key){ alert('Koden/länken kunde inte tolkas.'); return; } const label='Delad profil'; const acc={ id:uid(), label, pin:null, blobKey:key, createdAt:new Date().toISOString()}; const next=[...accounts, acc]; setAccounts(next); setAccountId(acc.id); try{ const r=await fetch(`/api/profiles/${key}`); if(r.ok){ const data=await safeJson(r); if(Array.isArray(data.users)) setUsers(data.users); if(data.profileMeta) setMeta(data.profileMeta); setToast({ type:'up', msg:'Profil kopplad och laddad från server.'}); } else { setToast({ type:'note', msg:'Koden kopplad, men ingen serverprofil fanns ännu.'}); } } catch(e){ alert(e.message);} }

  useEffect(()=>{ const k=new URLSearchParams(location.search).get("k"); if(!k) return; const acc={ id:uid(), label:"Delad profil", pin:null, blobKey:k, createdAt:new Date().toISOString()}; setAccounts(prev=>[...prev, acc]); setAccountId(acc.id); history.replaceState({}, "", location.pathname); },[]);

  // Logs + FT
  function ensureDefaultSets(log, rows, failureRepsVal){ return rows.map((r,idx)=>{ const old=log?.sets?.[idx]||{}; const actualKg= Number.isFinite(old.actualKg)? old.actualKg : r.targetKg; let reps; if(Number.isFinite(old.reps)) reps=old.reps; else if(typeof r.reps==="number") reps=r.reps; else if(r.kind==="failure") reps= Number.isFinite(failureRepsVal)? Number(failureRepsVal): 0; else reps=0; return { actualKg, reps }; }); }
  function writeLog(workoutId, entry){ if(!selected) return; const prev=selected.logs?.[workoutId] || { sets:[], done:false }; updateSelected({ logs:{ ...selected.logs, [workoutId]: { ...prev, ...entry }}}); }
  function markDone(workoutId, done=true, opts={}){
    if(!selected) return; const prev=selected.logs?.[workoutId] || { sets:[], done:false };
    if(done && !prev.done){ const rowsNow= opts.forceRows || buildPrescription(workoutId, selected.workingRmKg, selected.rounding); const sets=ensureDefaultSets(prev, rowsNow, prev.failureReps); writeLog(workoutId, { ...prev, sets, done:true, doneAt:new Date().toISOString(), lockedRmKg:selected.workingRmKg, lockedRounding:selected.rounding, lockedRows:rowsNow }); if(!opts.suppressQuote) showQuote("pass_done"); }
    else if(!done && prev.done){ const { lockedRmKg, lockedRounding, lockedRows, doneAt, ...rest }=prev; writeLog(workoutId, { ...rest, done:false }); }
    else { writeLog(workoutId, { ...prev, done }); }
  }
  function recomputeWorkingRm(excludeId=null){ if(!selected) return selected?.workingRmKg||0; let w=Number(selected.oneRmKg)||0; for(const id of FT_IDS){ if(id===excludeId) continue; const lg=selected.logs?.[id]; if(lg?.ftApplied && Number.isFinite(lg.ftDelta)) w += Number(lg.ftDelta); } return roundTo(w, 0.5); }
  function confirmFailure(workoutId){ if(!selected) return; const log=selected.logs?.[workoutId]||{}; if(log.ftApplied){ setToast({ type:"note", msg:"Failure Test är redan bekräftat för detta pass."}); return; } const rowsNow=(log?.done && Array.isArray(log.lockedRows) && log.lockedRows.length)? log.lockedRows : (prescriptions[workoutId]||[]); const reps=Number(log.failureReps); const ftDelta=calcFtDelta(reps); const sets=ensureDefaultSets(log, rowsNow, reps); writeLog(workoutId, { ...log, sets, failureReps:reps }); markDone(workoutId, true, { forceRows:rowsNow, suppressQuote:true }); writeLog(workoutId, { ...log, sets, failureReps:reps, ftApplied:true, ftDelta }); if(ftDelta!==0) updateSelected({ workingRmKg: roundTo(selected.workingRmKg + ftDelta, 0.5)}); let kind="ft_silver"; if(reps>=8) kind="ft_gold"; else if(reps<=3) kind="ft_bronze"; const deltaStr= ftDelta>0?`(+${ftDelta} kg)`: ftDelta<0?`(${ftDelta} kg)`:"(±0 kg)"; showQuote(kind, `FT: ${reps} reps ${deltaStr}`); }
  function undoFailure(workoutId){ if(!selected) return; const log=selected.logs?.[workoutId]; if(!log?.ftApplied){ setToast({ type:'note', msg:'Ingen FT att ångra för detta pass.'}); return; } const newWork=recomputeWorkingRm(workoutId); writeLog(workoutId, { ...log, ftApplied:false, ftDelta:undefined }); updateSelected({ workingRmKg:newWork }); setToast({ type:'note', msg:'FT återkallad. Arbets‑1RM har räknats om.'}); }

  // Server (Blob)
  async function saveRemoteProfile(){ if(!accountId) return; const acc=accounts.find(a=>a.id===accountId); const blobKey=acc?.blobKey||acc?.id; setBusy(true); try{ const nextMeta={ rev:(meta?.rev||0)+1, lastSavedAt:new Date().toISOString(), savedByDeviceId:deviceId }; const profile={ users, profileMeta:nextMeta }; const r=await fetch('/api/profiles/save',{ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ blobKey, profile })}); if(!r.ok) throw new Error('Save failed'); setMeta(nextMeta); setToast({ type:'up', msg:'Sparat till server (Blob)'}); } catch(e){ alert('Kunde inte spara: '+e.message);} finally{ setBusy(false);} }
  async function loadRemoteProfile(){ if(!accountId) return; const acc=accounts.find(a=>a.id===accountId); const blobKey=acc?.blobKey||acc?.id; setBusy(true); try{ const r=await fetch(`/api/profiles/${blobKey}`); if(!r.ok) throw new Error('Hittar ingen serverprofil'); const data=await safeJson(r); if(Array.isArray(data.users)) setUsers(data.users); if(data.profileMeta) setMeta(data.profileMeta); setToast({ type:'up', msg:'Laddat från server (Blob)'}); } catch(e){ alert('Kunde inte ladda: '+e.message);} finally{ setBusy(false);} }
  function mergeProfiles(localUsers, remoteUsers){ const byId=new Map(remoteUsers.map(u=>[u.id,u])); const merged=[]; for(const lu of localUsers){ const ru=byId.get(lu.id); if(!ru){ merged.push(lu); continue;} const lDone=Object.values(lu.logs||{}).filter(x=>x.done).length; const rDone=Object.values(ru.logs||{}).filter(x=>x.done).length; merged.push(rDone>=lDone? ru: lu); byId.delete(lu.id);} for(const ru of byId.values()) merged.push(ru); return merged; }
  async function syncNow(){ if(!accountId) return; const acc=accounts.find(a=>a.id===accountId); const blobKey=acc?.blobKey||acc?.id; setBusy(true); try{ const r=await fetch(`/api/profiles/${blobKey}`); if(r.ok){ const remote=await safeJson(r); const remoteUsers=Array.isArray(remote.users)? remote.users:[]; const remoteMeta=remote.profileMeta||{rev:0}; const localRev=meta?.rev||0, remoteRev=remoteMeta.rev||0; if(remoteRev>localRev){ const merged=mergeProfiles(users, remoteUsers); setUsers(merged); setMeta(remoteMeta); setToast({ type:'up', msg:'Synk: hämtade och slog ihop ändringar.'}); } else if(remoteRev<localRev){ await saveRemoteProfile(); } else { setToast({ type:'note', msg:'Synk: inget att göra.'}); } } else { await saveRemoteProfile(); } } catch(e){ alert('Synk misslyckades: '+e.message);} finally{ setBusy(false);} }
  async function openHistory(){ if(!accountId) return; const acc=accounts.find(a=>a.id===accountId); const blobKey=acc?.blobKey||acc?.id; setHistoryOpen(true); setAdminInHistory(false); setHistoryBusy(true); try{ const r=await fetch(`/api/profiles/history?key=${blobKey}`); if(!r.ok) throw new Error('Kunde inte lista historik'); const data=await safeJson(r); setHistoryItems(Array.isArray(data.items)? data.items: []); } catch(e){ alert(e.message);} finally{ setHistoryBusy(false);} }
  async function restoreSnapshot(item){ try{ const r=await fetch(item.url); if(!r.ok) throw new Error('Kunde inte hämta snapshot'); const data=await safeJson(r); if(Array.isArray(data.users)) setUsers(data.users); if(data.profileMeta) setMeta(data.profileMeta); setToast({ type:'up', msg:'Återställde snapshot lokalt. Spara till server för att skriva över.'}); } catch(e){ alert(e.message);} }

  // Admin login/logout (via Historik)
  async function adminLogin(){ const code=window.prompt("Admin kod (6 siffror):"); if(!code) return false; try{ const r=await fetch('/api/admin/login',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ code })}); if(r.status===204){ setIsAdmin(true); setToast({ type:'up', msg:'Adminläge aktiverat'}); return true; } else { throw new Error('Fel kod'); } } catch(e){ alert(e.message); return false; } }
  async function adminLogout(){ try{ await fetch('/api/admin/login',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ logout:true })}); } finally { setIsAdmin(false); setAdminInHistory(false); } }

  const activeAcc = accounts.find(a=>a.id===accountId);
  const shareLink = activeAcc ? `${location.origin}${location.pathname}?k=${activeAcc.blobKey}` : '';
  function copyShareLink(){ navigator.clipboard?.writeText(shareLink); setToast({ type:'up', msg:'Delningslänk kopierad!'}); }

  // ==== Render: login view ====
  if(!accountId){
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 grid place-items-center p-6">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border p-6">
          <div className="text-center mb-4">
            <div className="text-3xl md:text-4xl font-extrabold flex items-center justify-center gap-3"><LiftEmoji/><span>MM2K Bench</span></div>
            <div className="text-slate-700">6 veckor, 14 pass, lokala profiler</div>
          </div>
          <div className="space-y-3">
            <button className={`${BTN_BASE} ${BTN_SOLID} w-full`} onClick={createAccount}>+ Ny profil</button>
            <button className={`${BTN_BASE} ${BTN_SUBTLE} w-full`} onClick={()=>connectWithCodeFlow()}>Anslut med kod…</button>
            {accounts.length>0 && (
              <div>
                <div className="text-sm font-medium mb-2">Befintliga profiler</div>
                <ul className="space-y-2">
                  {accounts.map(a=> (
                    <li key={a.id} className="flex items-center justify-between rounded-xl border p-2">
                      <div>
                        <div className="font-medium">{a.label}</div>
                        <div className="text-xs text-slate-500">{a.pin? 'PIN-skyddad':'Ingen PIN'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>switchAccount(a)}>Välj</button>
                        <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>deleteAccount(a.id)}>Ta bort</button>
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

  // ==== Render: main app ====
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200">
        <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-sky-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <LiftEmoji/>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">MM2K Bench</h1>
                <p className="text-sm md:text-base text-white/95">6 veckor, 14 pass, kg‑beräkningar, FT‑stjärnor, quotes & admin via historik</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button disabled={busy} onClick={syncNow} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy? 'Synkar…':'Synk nu'}</button>
              <button disabled={busy} onClick={saveRemoteProfile} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy? 'Sparar…':'Spara till server'}</button>
              <button disabled={busy} onClick={loadRemoteProfile} className={`${BTN_BASE} ${BTN_SUBTLE} disabled:opacity-50`}>{busy? 'Laddar…':'Ladda från server'}</button>
              <button onClick={openHistory} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Historik & Admin</button>
              <div className="relative">
                <button onClick={()=>setShowAccountPanel(v=>!v)} className={`${BTN_BASE} ${BTN_SUBTLE}`}>Profil: {activeAcc?.label||'Okänd'}</button>
                {showAccountPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-white text-slate-900 rounded-xl shadow-lg border p-2">
                    <div className="px-2 py-1 text-xs text-slate-500">Profiler</div>
                    <ul className="max-h-60 overflow-auto">
                      {accounts.map(a=> (
                        <li key={a.id} className="flex items-center justify-between rounded-lg hover:bg-slate-50 px-2 py-1">
                          <button className="text-left" onClick={()=>switchAccount(a)}>
                            <div className="font-medium">{a.label}</div>
                            <div className="text-xs text-slate-500">{a.pin? 'PIN':'Ingen PIN'} · Blob‑ID: {a.blobKey?.slice(0,8)}…</div>
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
                        <div className="pt-1 border-t" />
                        <div className="font-medium">Anslut med kod eller länk</div>
                        <div className="flex items-center gap-2">
                          <input type="text" value={linkCode} onChange={e=>setLinkCode(e.target.value)} placeholder="Klistra in kod eller ?k=…" className="rounded-xl border px-3 py-2 grow" />
                          <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ if(linkCode.trim()){ connectWithCodeFlow(linkCode.trim()); setLinkCode(""); setLinkPanel(false);} }}>Anslut</button>
                        </div>
                        <div className="text-[10px] text-slate-500">Öppna länken på din andra enhet (mobil/dator) eller klistra in koden här.</div>
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
            {users.map(u=> (
              <li key={u.id} className={`flex items-center justify-between rounded-xl px-2 py-1 ${selectedId===u.id? 'bg-slate-100':''}`}>
                <button onClick={()=>setSelectedId(u.id)} className="text-left grow">
                  <div className="font-medium">{u.name||'Namnlös'}</div>
                  <div className="text-xs text-slate-500">1RM: {u.oneRmKg} kg · Arbets‑1RM: {u.workingRmKg} kg</div>
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
            <div>Senast sparad: {meta?.lastSavedAt? new Date(meta.lastSavedAt).toLocaleString() : '–'}</div>
          </div>
        </aside>

        <section className="space-y-6">
          {/* AdminPanel renderas i Historik‑modalt */}

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
                    <input type="number" className="rounded-xl border px-3 py-2" value={selected.oneRmKg} onChange={e=>{ const v=Number(e.target.value||0); updateSelected({ oneRmKg:v, workingRmKg:v }); }} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Arbets‑1RM (kg)</span>
                    <div className="flex gap-2">
                      <input type="number" className="rounded-xl border px-3 py-2 grow" value={selected.workingRmKg} onChange={e=>updateSelected({ workingRmKg:Number(e.target.value||0) })} />
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>updateSelected({ workingRmKg:selected.oneRmKg })}>Reset</button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Avrundning (kg‑steg)</span>
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
                          <div>Uppnått via Failure‑test: <span className="font-medium">{projected.delta>=0? "+":""}{projected.delta} kg</span></div>
                          <div className="mt-1">Intervall: <span className="font-semibold">{projected.min} – {projected.max} kg</span> (återstår {projected.remaining} FT)</div>
                        </>
                      ) : (<div>Ingen prognos tillgänglig.</div>)}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="rounded-xl border p-3 bg-white text-sm flex items-center justify-between">
                      <div className="font-medium">Failure‑stjärnor</div>
                      <div className="flex gap-1 text-xl">
                        {FT_IDS.map((id)=> renderStar(starFromReps(selected.logs?.[id]?.failureReps), id))}
                      </div>
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
                {WORKOUTS.map(w=>{
                  const log=selected.logs?.[w.id]||{ sets:[], done:false, failureReps:undefined };
                  const rows=(log.done && Array.isArray(log.lockedRows) && log.lockedRows.length)? log.lockedRows : (prescriptions[w.id]||[]);
                  const reps=log.failureReps;
                  const suggestion=(typeof reps==="number" && !Number.isNaN(reps))? (reps>=8? 'increase' : (reps<=3? 'decrease':'hold')): null;
                  const proposedUp= roundTo(selected.workingRmKg + 2.5, 0.5);
                  const proposedDown= roundTo(Math.max(0, selected.workingRmKg - 2.5), 0.5);
                  const isLocked= !!log.done;

                  return (
                    <article key={w.id} className={`rounded-2xl border shadow-sm bg-white p-4 ${log.done? 'ring-2 ring-green-500/40':''}`}>
                      <header className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold flex items-center gap-2">{w.name}
                            {rows.some(r=>r.kind==="failure") && (
                              <span className="text-xl" title={`FT: ${typeof reps==='number'? reps+' reps':'inte gjort'}`}>{renderStar(starFromReps(reps))}</span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-500">Beräknat från arbets‑1RM {selected.workingRmKg} kg{log.done && log.doneAt? ` (låst ${new Date(log.doneAt).toLocaleDateString()})`: ''}</p>
                          {log.ftApplied && (
                            <div className="mt-1 inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">FT bekräftad {log.ftDelta>0?`(+${log.ftDelta} kg)`:log.ftDelta<0?`(${log.ftDelta} kg)`:"(±0 kg)"}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>markDone(w.id, !log.done)} className={`${BTN_BASE} ${log.done? BTN_GOOD: BTN_SUBTLE}`}>{log.done? 'Klart':'Markera klart'}</button>
                        </div>
                      </header>

                      <table className="w-full text-sm border-separate" style={{borderSpacing:"0 6px"}}>
                        <thead>
                          <tr className="text-left text-slate-500"><th className="font-medium">Set</th><th className="font-medium">Reps</th><th className="font-medium">Rek. vikt</th><th className="font-medium">Logg</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r,idx)=> (
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

                      {rows.some(r=>r.kind==="failure") && (
                        <div className={`mt-4 rounded-xl ${isLocked? 'bg-slate-50 border border-slate-200':'bg-amber-50 border border-amber-200'} p-3`}>
                          <div className="text-sm mb-2 font-medium">Failure Test</div>
                          <p className="text-sm text-slate-600 mb-2">Max reps med block 2‑vikten ({rows[1]?.targetKg} kg). 4–7 reps: ingen ändring. ≤3: −2.5 kg. ≥8: +2.5 kg.</p>
                          <div className="flex items-center gap-2 mb-2">
                            <input type="number" placeholder="antal reps" className="rounded-xl border px-3 py-2 w-36" value={log.failureReps ?? ''} disabled={isLocked || log.ftApplied}
                              onChange={e=>writeLog(w.id, { ...log, failureReps:Number(e.target.value||0) })} />
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
                              <span>Detta pass är låst – inga ändringar tillåtna.</span>
                              {log.ftApplied && <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>undoFailure(w.id)}>Ångra FT</button>}
                            </div>
                          )}
                        </div>
                      )}

                      {rows.some(r=>r.kind==="negative") && (<div className="mt-3 text-xs text-slate-600">Negativt set: tung excentrisk 1x1 (~110% av arbets‑1RM). Träna säkert med spotter.</div>)}
                      {rows.some(r=>r.kind==="max") && (<div className="mt-3 text-xs text-slate-600">Max‑test: sikta runt ~115% av start‑1RM; FT‑utfall under vägen kan höja/sänka målet.</div>)}
                    </article>
                  );
                })}
              </div>

              <div className="rounded-2xl border shadow-sm bg-white p-4 text-sm text-slate-600">
                <h3 className="font-semibold mb-2">Tips och upplägg</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Två bänkpass per vecka, 14 totalt.</li>
                  <li>FT‑dagar styr arbets‑1RM (±2.5 kg). Negativ‑dagar ligger över ~110%.</li>
                  <li>Vikter beräknas från ditt arbets‑1RM och avrundas till valda kg‑steg.</li>
                  <li>Sista passet siktar runt 115% av start‑1RM; FT justerar vidare.</li>
                </ul>
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
                <h3 className="font-semibold">{adminInHistory? 'Adminpanel' : 'Snapshots (server)'} </h3>
                {isAdmin && (
                  <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setAdminInHistory(v=>!v)}>{adminInHistory? 'Visa historik':'Visa admin'}</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isAdmin && (<button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={async ()=>{ const ok=await adminLogin(); if(ok) setAdminInHistory(true); }}>Admin…</button>)}
                {isAdmin && (<button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={adminLogout}>Logga ut</button>)}
                <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>setHistoryOpen(false)}>Stäng</button>
              </div>
            </div>

            {adminInHistory && isAdmin ? (
              <div className="max-h-[70vh] overflow-auto">
                <AdminPanel/>
              </div>
            ) : (
              historyBusy ? (
                <div className="text-sm text-slate-600">Hämtar…</div>
              ) : (
                <div className="max-h-[70vh] overflow-auto divide-y">
                  {historyItems.length===0 ? (
                    <div className="text-sm text-slate-500">Ingen historik hittad.</div>
                  ) : historyItems.map((it)=>(
                    <div key={it.pathname} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{it.pathname.split('/').pop()}</div>
                        <div className="text-xs text-slate-500">{it.uploadedAt? new Date(it.uploadedAt).toLocaleString():'—'} · {it.size? `${(it.size/1024).toFixed(1)} kB`:''}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={it.url} target="_blank" rel="noreferrer" className={`${BTN_BASE} ${BTN_SUBTLE}`}>Visa</a>
                        <button className={`${BTN_BASE} ${BTN_GOOD}`} onClick={()=>restoreSnapshot(it)}>Återställ lokalt</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
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
              <span className="text-xl">{toast.type==='up'? '🎉':'ℹ️'}</span>
              <div className="text-sm leading-snug">
                <div className="font-semibold">{toast.type==='up'? 'Grattis!':'Notis'}</div>
                <div>{toast.msg}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <span>Rev: {meta?.rev||0}</span>
          <span>Senast sparad: {meta?.lastSavedAt? new Date(meta.lastSavedAt).toLocaleString():'–'}</span>
          <span>Device: {deviceId.slice(0,8)}…</span>
          <span className="ml-auto">App {APP_VERSION}</span>
        </div>
      </footer>
    </div>
  );
}

/****************
 * AdminPanel (Client‑side)
 ****************/
function AdminPanel(){
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ (async()=>{ try{ const r=await fetch("/api/admin/profiles"+(q?`?q=${encodeURIComponent(q)}`:"")); if(r.ok){ const j=await safeJson(r); setRows(j.items||[]);} else { throw new Error('Admin-listning misslyckades'); } } catch(e){ alert(e.message);} })(); },[q]);

  async function copyLink(key){
    try{
      const r = await fetch(`/api/admin/sharelink?key=${key}`);
      if(r.ok){ const { link } = await safeJson(r); await navigator.clipboard?.writeText(link); alert(`Delningslänk kopierad:
${link}`); return; }
      throw new Error('Kunde inte skapa delningslänk');
    }catch(e){
      // Fallback
      const base = location.origin + location.pathname; const link = `${base}?k=${key}`; await navigator.clipboard?.writeText(link); alert(`Delningslänk kopierad (fallback):
${link}`);
    }
  }
  async function removeProfile(key){ if(!confirm("Radera hela profilen (inkl. historik)?")) return; const r=await fetch(`/api/admin/profile/${key}`,{ method:"DELETE"}); if(r.status===204){ setRows(rows.filter(x=>x.blobKey!==key)); if(selectedKey===key){ setSelectedKey(null); setSelectedProfile(null);} } }
  async function openProfile(key){ setSelectedKey(key); setLoading(true); try{ const r=await fetch(`/api/admin/profile/${key}`); if(!r.ok) throw new Error('Kunde inte läsa profilen'); const j=await safeJson(r); setSelectedProfile(j); } catch(e){ alert(e.message);} finally{ setLoading(false);} }

  async function patch(op, payload){ if(!selectedKey) return; const r= await fetch(`/api/admin/profile/${selectedKey}`,{ method:"PATCH", headers:{'content-type':'application/json'}, body: JSON.stringify({ op, ...payload})}); if(r.ok){ await openProfile(selectedKey); } }

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold">Admin – profiler</h3>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filtrera..." className="rounded-xl border px-3 py-2"/>
      </div>
      <div className="mt-3 grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-3 max-h-[60vh] overflow-auto">
          {rows.length===0? <div className="text-sm text-slate-500">Inga profiler funna.</div> : rows.map(r=> (
            <div key={r.blobKey} className={`flex items-center justify-between gap-3 py-2 ${selectedKey===r.blobKey? 'bg-slate-50 px-2 rounded-lg':''}`}>
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
                {(selectedProfile.users||[]).map(u=> (
                  <div key={u.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.name||'Namnlös'}</div>
                      <div className="text-xs text-slate-500">1RM {u.oneRmKg} · Arb1RM {u.workingRmKg}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ const name=prompt('Nytt namn', u.name||''); if(name!=null) patch('renameUser',{ id:u.id, name}); }}>Byt namn</button>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ const v=Number(prompt('Sätt Arbets‑1RM (kg)', u.workingRmKg)); if(!Number.isNaN(v)) patch('setWorkingRm',{ id:u.id, value:v}); }}>Sätt Arb‑1RM</button>
                      <button className={`${BTN_BASE} ${BTN_SUBTLE}`} onClick={()=>{ if(confirm('Rensa alla loggar för denna användare?')) patch('resetLogs',{ id:u.id}); }}>Rensa loggar</button>
                      <button className={`${BTN_BASE} ${BTN_BAD}`} onClick={()=>{ if(confirm('Ta bort användaren?')) patch('removeUser',{ id:u.id}); }}>Ta bort</button>
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

/****************
 * UI helpers
 ****************/
function LiftEmoji(){ return (<span className="inline-flex items-center justify-center text-3xl select-none" aria-hidden>🏋️‍♂️</span>); }

const BTN_BASE = "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm transition border";
const BTN_SUBTLE = "bg-white/90 hover:bg-white text-slate-700 border-slate-200";
const BTN_SOLID = "bg-white text-slate-900 hover:bg-white/90 border-white";
const BTN_GOOD = "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700";
const BTN_BAD = "bg-rose-600 hover:bg-rose-700 text-white border-rose-700";

