import React, { useEffect, useMemo, useState } from "react";

/**
 * MM2K (Muscle Media 2000) – "Add up to 40 lb to your Bench in 6 Weeks"
 * Webapp in a single App.jsx file.
 *
 * What it does
 * - Skapar/använder flera användare (lagras i localStorage)
 * - För varje användare: sätter 1RM (kg), genererar 14 pass enligt MM2K-upplägget
 * - Visar rekommenderade vikter i KG (avrundning till närmsta 2.5 kg som standard)
 * - Loggning per set (vikt, reps, kommentar) och markera pass som klart
 * - Inbyggt "Failure Test" på udda pass (#5, 7, 9, 11, 13) – justerar arbets-1RM upp/ner
 * - "Negative only" på #6, 8, 10 och Max-test på #14
 * - Export/Import (JSON) av all lokal data
 *
 * OBS om tabell/beräkning
 * Originalprogrammet använder en progressionstabell i LBS. Här använder vi en
 * procent-baserad approximation kalibrerad mot exemplen i artikeln (t.ex. 1RM 290 lb →
 * pass #1: 8@~66%, 6@~74%, 5@~79%). Det matchar originalets struktur (rep-scheman,
 * failure test och negative-dagar), men exakta vikter kan skilja något. 
 * Du kan när som helst justera din "arbets-1RM" manuellt i UI:t om du vill följa
 * en egen tabell.
 *
 * Källor (för upplägg/struktur – progressionstabell, workout sheet och failure‑test):
 * - Critical Bench speglar MM2K-materialet och PDF:er:
 *   Progression Table:  https://www.criticalbench.com/samples/mm2k_3.pdf
 *   Workout Sheet:      https://www.criticalbench.com/samples/mm2k_2.pdf
 *   Misc/Failure table: https://www.criticalbench.com/samples/mm2k.pdf
 *
 * © Detta är ett hjälpskript för egen träning. Använd sunt förnuft, bra teknik och spotter.
 */

/**********************
 * Små hjälpfunktioner *
 **********************/
const LS_KEY = "mm2k_users_v1";
const kgStepDefault = 2.5;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function roundToStep(value, step = kgStepDefault) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/***********************************
 * MM2K rep-scheman (14 bänkpass)  *
 ***********************************/
// matchar ordern i originalets "Workout Sheet" (mm2k_2.pdf)
const WORKOUTS = [
  // index 0 = Workout #1
  { id: 1,  name: "Workout #1",  blocks: [
      { sets: 1, reps: 8,  kind: "work" },
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 3, reps: 5,  kind: "work" },
    ] },
  { id: 2,  name: "Workout #2",  blocks: [
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 2, reps: 3,  kind: "work" },
      { sets: 1, reps: 1,  kind: "single" },
    ] },
  { id: 3,  name: "Workout #3",  blocks: [
      { sets: 1, reps: 8,  kind: "work" },
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 3, reps: 5,  kind: "work" },
    ] },
  { id: 4,  name: "Workout #4",  blocks: [
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 2, reps: 3,  kind: "work" },
      { sets: 1, reps: 1,  kind: "single" },
    ] },
  { id: 5,  name: "Workout #5 (Failure Test)", blocks: [
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 1, reps: "FT", kind: "failure" }, // failure test – reps till max med set#2-vikten
    ] },
  { id: 6,  name: "Workout #6 (Negative Only)", blocks: [
      { sets: 2, reps: 3,  kind: "work" },
      { sets: 2, reps: 2,  kind: "work" },
      { sets: 1, reps: 1,  kind: "negative" },
    ] },
  { id: 7,  name: "Workout #7 (Failure Test)", blocks: [
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 1, reps: "FT", kind: "failure" },
    ] },
  { id: 8,  name: "Workout #8 (Negative Only)", blocks: [
      { sets: 2, reps: 3,  kind: "work" },
      { sets: 2, reps: 1,  kind: "work" },
      { sets: 1, reps: 1,  kind: "negative" },
    ] },
  { id: 9,  name: "Workout #9 (Failure Test)", blocks: [
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 1, reps: "FT", kind: "failure" },
    ] },
  { id: 10, name: "Workout #10 (Negative Only)", blocks: [
      { sets: 2, reps: 3,  kind: "work" },
      { sets: 2, reps: 1,  kind: "work" },
      { sets: 1, reps: 1,  kind: "negative" },
    ] },
  { id: 11, name: "Workout #11 (Failure Test)", blocks: [
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 1, reps: "FT", kind: "failure" },
    ] },
  { id: 12, name: "Workout #12", blocks: [
      { sets: 2, reps: 3,  kind: "work" },
      { sets: 1, reps: 2,  kind: "work" },
      { sets: 1, reps: 1,  kind: "single" },
    ] },
  { id: 13, name: "Workout #13 (Failure Test)", blocks: [
      { sets: 1, reps: 6,  kind: "work" },
      { sets: 2, reps: 5,  kind: "work" },
      { sets: 1, reps: "FT", kind: "failure" },
    ] },
  { id: 14, name: "Workout #14 (Max Test)", blocks: [
      { sets: 1, reps: 3,  kind: "work" },
      { sets: 1, reps: 2,  kind: "work" },
      { sets: 1, reps: 1,  kind: "max" },
    ] },
];

/*********************************************
 * Procent-approximation av progressionstabell
 *********************************************/
/**
 * getPercentsForWorkout
 * Returnerar tre procentvärden (p1, p2, p3) för en workouts tre viktblock
 * (corresponderar mot block 1, 2, 3 ovan). Dessa är kalibrerade mot publicerade
 * exempel i artikeln och följer den tänkta ökningen i programmet.
 */
function getPercentsForWorkout(w) {
  switch (w) {
    case 1:  return [0.66, 0.74, 0.793]; // 8,6,5×3
    case 2:  return [0.724, 0.81, 0.897]; // 5×2, 3×2, 1×1
    case 3:  return [0.68, 0.76, 0.81];   // lätt ökning från #1
    case 4:  return [0.76, 0.86, 0.94];   // tyngre dag
    case 5:  return [0.74, 0.845, 0.845]; // 6, 5×2 + Failure Test på p2
    case 6:  return [0.83, 0.92, 1.08];   // 3×2, 2×2, Negativ ~108% av 1RM
    case 7:  return [0.75, 0.86, 0.86];
    case 8:  return [0.86, 0.95, 1.10];   // Negative ~110%
    case 9:  return [0.76, 0.875, 0.875];
    case 10: return [0.88, 0.97, 1.12];   // Negative ~112%
    case 11: return [0.77, 0.89, 0.89];
    case 12: return [0.92, 0.98, 1.00];
    case 13: return [0.78, 0.905, 0.905];
    case 14: return [0.95, 1.00, 1.02];   // sista set = Max-test (försök nytt 1RM)
    default: return [0.7, 0.8, 0.9];
  }
}

function kg(v) {
  return Number.isFinite(v) ? v : 0;
}

/**********************************************
 * Generering av rekommenderade vikter per pass
 **********************************************/
function buildWorkoutPrescription(workoutId, oneRmKg, rounding = kgStepDefault) {
  const [p1, p2, p3] = getPercentsForWorkout(workoutId);
  const blocks = WORKOUTS.find(w => w.id === workoutId)?.blocks || [];
  const weights = [
    roundToStep(kg(oneRmKg) * p1, rounding),
    roundToStep(kg(oneRmKg) * p2, rounding),
    roundToStep(kg(oneRmKg) * p3, rounding),
  ];

  // Mappa ut block → rader med faktiska set
  const rows = [];
  blocks.forEach((b, i) => {
    const base = (b.kind === "failure" ? weights[1] : weights[i]);
    const label = b.kind === "failure" ? "Failure Test" :
                  b.kind === "negative" ? "Negative only" :
                  b.kind === "max" ? "Max Test" :
                  b.kind === "single" ? "Single" : "Work";
    for (let s = 0; s < b.sets; s++) {
      rows.push({
        kind: b.kind,
        label,
        reps: b.reps,
        targetKg: base,
        // För failure-test använder vi alltid block #2-vikten (p2)
        note: b.kind === "failure" ? "Repa ut till legit fail med block #2-vikten" : "",
      });
    }
  });
  return rows;
}

/***************************************************
 * Failure Test – enkel auto-justering av arbets-1RM
 ***************************************************/
function applyFailureAdjustment(currentRmKg, testWeightKg, achievedReps) {
  if (!Number.isFinite(achievedReps)) return currentRmKg;
  if (achievedReps >= 8) return roundToStep(currentRmKg + 2.5, 0.5); // +2.5 kg
  if (achievedReps <= 3) return roundToStep(Math.max(0, currentRmKg - 2.5), 0.5); // -2.5 kg
  return currentRmKg; // 4–7 → oförändrat
}

function epley1RM(weightKg, reps) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || reps < 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/*********************
 * Användardatamodell *
 *********************/
const NEW_USER = () => ({
  id: uid(),
  name: "",
  startDate: new Date().toISOString().slice(0, 10),
  oneRmKg: 100,
  workingRmKg: 100,
  rounding: kgStepDefault,
  notes: "",
  logs: {}, // key = workoutId → { sets: [{actualKg, reps, note}], done: bool, failureReps?: number }
});

function loadUsers() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(LS_KEY, JSON.stringify(users));
}

/****************
 * Huvudkomponent
 ****************/
export default function App() {
  const [users, setUsers] = useState(loadUsers());
  const [selectedId, setSelectedId] = useState(users[0]?.id || null);
  const selected = useMemo(() => users.find(u => u.id === selectedId) || null, [users, selectedId]);

  useEffect(() => { saveUsers(users); }, [users]);

  function addUser() {
    const u = NEW_USER();
    u.name = `Athlete ${users.length + 1}`;
    setUsers(prev => [...prev, u]);
    setSelectedId(u.id);
  }

  function updateSelected(patch) {
    setUsers(prev => prev.map(u => (u.id === selectedId ? { ...u, ...patch } : u)));
  }

  function removeUser(id) {
    setUsers(prev => prev.filter(u => u.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function resetLogs() {
    if (!selected) return;
    if (!window.confirm("Rensa alla loggar för denna användare?")) return;
    updateSelected({ logs: {} });
  }

  // Prescriptions per workout for current working RM
  const prescriptions = useMemo(() => {
    if (!selected) return {};
    const out = {};
    for (const w of WORKOUTS) {
      out[w.id] = buildWorkoutPrescription(w.id, selected.workingRmKg, selected.rounding);
    }
    return out;
  }, [selected]);

  function writeLog(workoutId, newEntry) {
    if (!selected) return;
    const prev = selected.logs?.[workoutId] || { sets: [], done: false };
    const patch = {
      logs: {
        ...selected.logs,
        [workoutId]: { ...prev, ...newEntry },
      },
    };
    updateSelected(patch);
  }

  function markDone(workoutId, done=true) {
    writeLog(workoutId, { done });
  }

  function applyFailure(workoutId, reps) {
    if (!selected) return;
    const rows = prescriptions[workoutId] || [];
    const p2Weight = rows[1]?.targetKg || 0; // block #2
    const newRm = applyFailureAdjustment(selected.workingRmKg, p2Weight, Number(reps));
    updateSelected({ workingRmKg: newRm });
    writeLog(workoutId, { failureReps: Number(reps) });
  }

  function setEpleyFromFailure(workoutId, reps) {
    if (!selected) return;
    const rows = prescriptions[workoutId] || [];
    const p2Weight = rows[1]?.targetKg || 0; // block #2
    const est = epley1RM(p2Weight, Number(reps));
    updateSelected({ workingRmKg: roundToStep(est, 0.5) });
    writeLog(workoutId, { failureReps: Number(reps) });
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify(users, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mm2k-users.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function importAll(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) {
          setUsers(data);
          setSelectedId(data[0]?.id || null);
        } else {
          alert("Ogiltigt JSON-format.");
        }
      } catch (e) {
        alert("Kunde inte läsa JSON: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">MM2K Bench – 6 veckor / 14 pass</h1>
          <div className="flex items-center gap-2">
            <button onClick={addUser} className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:opacity-90">+ Ny användare</button>
            <button onClick={exportAll} className="px-3 py-1.5 rounded-xl border">Exportera</button>
            <label className="px-3 py-1.5 rounded-xl border cursor-pointer">
              Importera
              <input type="file" accept="application/json" className="hidden" onChange={e => e.target.files && importAll(e.target.files[0])}/>
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid md:grid-cols-[260px,1fr] gap-6">
        {/* Sidebar – Users */}
        <aside className="bg-white rounded-2xl shadow-sm border p-3 h-fit">
          <h2 className="text-lg font-semibold mb-2">Användare</h2>
          <ul className="space-y-1">
            {users.map(u => (
              <li
                key={u.id}
                className={`flex items-center justify-between rounded-xl px-2 py-1 ${
                  selectedId === u.id ? "bg-slate-100" : ""
                }`}
              >
                <button
                  onClick={() => setSelectedId(u.id)}
                  className="text-left grow"
                >
                  <div className="font-medium">{u.name || "Namnlös"}</div>
                  <div className="text-xs text-slate-500">
                    1RM: {u.oneRmKg} kg · Arbets-1RM: {u.workingRmKg} kg
                  </div>
                </button>
                <button
                  onClick={() => removeUser(u.id)}
                  className="text-slate-500 hover:text-rose-600"
                  title="Ta bort"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Content */}
        <section className="space-y-6">
          {!selected ? (
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
              <p className="text-slate-600">Lägg till en användare för att börja.</p>
            </div>
          ) : (
            <>
              {/* Settings card */}
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold mb-4">Profil & inställningar</h2>
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
                    <input type="number" className="rounded-xl border px-3 py-2" value={selected.oneRmKg}
                      onChange={e=>{
                        const v = Number(e.target.value || 0);
                        updateSelected({ oneRmKg: v, workingRmKg: v });
                      }} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Arbets‑1RM (kg) · används för beräkning</span>
                    <div className="flex gap-2">
                      <input type="number" className="rounded-xl border px-3 py-2 grow" value={selected.workingRmKg}
                        onChange={e=>updateSelected({ workingRmKg: Number(e.target.value || 0) })} />
                      <button className="px-3 py-2 rounded-xl border" title="Återställ till 1RM" onClick={()=>updateSelected({ workingRmKg: selected.oneRmKg })}>↺</button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Avrundning (kg‑steg)</span>
                    <select className="rounded-xl border px-3 py-2" value={selected.rounding}
                      onChange={e=>updateSelected({ rounding: Number(e.target.value) })}>
                      {[1,1.25,2,2.5,5].map(s=> <option key={s} value={s}>{s.toFixed(2).replace(/\.00$/,"")} kg</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-sm text-slate-600">Anteckningar</span>
                    <textarea rows={2} className="rounded-xl border px-3 py-2" value={selected.notes||""} onChange={e=>updateSelected({notes:e.target.value})}/>
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={resetLogs} className="px-3 py-2 rounded-xl border">Rensa loggar</button>
                </div>
              </div>

              {/* Plan */}
              <div className="grid md:grid-cols-2 gap-6">
                {WORKOUTS.map(w => {
                  const rows = prescriptions[w.id] || [];
                  const log = selected.logs?.[w.id] || { sets: [], done: false, failureReps: undefined };
                  return (
                    <article key={w.id} className={`rounded-2xl border shadow-sm bg-white p-4 ${log.done?"ring-2 ring-green-500/40":""}`}>
                      <header className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold">{w.name}</h3>
                          <p className="text-xs text-slate-500">Beräknat från arbets‑1RM {selected.workingRmKg} kg</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>markDone(w.id, !log.done)} className={`px-2.5 py-1.5 rounded-xl border text-sm ${log.done?"bg-green-600 text-white border-green-600":""}`}>{log.done?"Klart":"Markera klart"}</button>
                        </div>
                      </header>

                      <table className="w-full text-sm border-separate" style={{borderSpacing:"0 6px"}}>
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="font-medium">Set</th>
                            <th className="font-medium">Reps</th>
                            <th className="font-medium">Rek. vikt</th>
                            <th className="font-medium">Logg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => (
                            <tr key={idx} className="align-top">
                              <td className="py-1 pr-2 whitespace-nowrap">{r.label}</td>
                              <td className="py-1 pr-2">{String(r.reps)}</td>
                              <td className="py-1 pr-2">{r.targetKg} kg</td>
                              <td className="py-1">
                                <div className="flex gap-2">
                                  <input type="number" placeholder="kg" className="w-24 rounded-xl border px-2 py-1"
                                    value={log.sets?.[idx]?.actualKg ?? ""}
                                    onChange={e=>{
                                      const sets = [...(log.sets||[])];
                                      sets[idx] = { ...(sets[idx]||{}), actualKg: Number(e.target.value||0) };
                                      writeLog(w.id, { ...log, sets });
                                    }}
                                  />
                                  <input type="number" placeholder="reps" className="w-20 rounded-xl border px-2 py-1"
                                    value={log.sets?.[idx]?.reps ?? ""}
                                    onChange={e=>{
                                      const sets = [...(log.sets||[])];
                                      sets[idx] = { ...(sets[idx]||{}), reps: Number(e.target.value||0) };
                                      writeLog(w.id, { ...log, sets });
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Failure test UI om detta är ett FT-pass */}
                      {rows.some(r=>r.kind==="failure") && (
                        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
                          <div className="text-sm mb-2 font-medium">Failure Test</div>
                          <p className="text-sm text-slate-600 mb-2">Kör så många reps som möjligt med block #2‑vikten ({rows[1]?.targetKg} kg). 
                            
                            4–7 reps = oförändrat · ≤3 reps = minus 2.5 kg · ≥8 reps = plus 2.5 kg på arbets‑1RM.</p>
                          <div className="flex items-center gap-2">
                            <input type="number" placeholder="antal reps" className="rounded-xl border px-3 py-2 w-36"
                              value={log.failureReps ?? ""}
                              onChange={e=>writeLog(w.id, { ...log, failureReps: Number(e.target.value||0) })} />
                            <button className="px-3 py-2 rounded-xl border" onClick={()=>applyFailure(w.id, log.failureReps)}>Tillämpa ±2.5 kg</button>
                            <button className="px-3 py-2 rounded-xl border" title="Skatta nytt 1RM via Epley" onClick={()=>setEpleyFromFailure(w.id, log.failureReps)}>Sätt 1RM via Epley</button>
                          </div>
                        </div>
                      )}

                      {/* Negativa / Max info */}
                      {rows.some(r=>r.kind==="negative") && (
                        <div className="mt-3 text-xs text-slate-600">Negativt set: tung excentrisk 1×1 (~{Math.round(getPercentsForWorkout(w.id)[2]*100)}% av 1RM). Spotta säkert.</div>
                      )}
                      {rows.some(r=>r.kind==="max") && (
                        <div className="mt-3 text-xs text-slate-600">Max‑test: försök nytt 1RM. Värm upp smart, ha spotter, bänkkommandon om du tävlar.</div>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="rounded-2xl border shadow-sm bg-white p-4 text-sm text-slate-600">
                <h3 className="font-semibold mb-2">Tips & upplägg (kortversion)</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Två bänkpass/vecka enligt schemat ovan (14 bänkpass totalt).</li>
                  <li>Udda pass använder 6:or/5:or + Failure Test; jämna pass är tyngre (3:or/1:or) och vissa innehåller negativa set.</li>
                  <li>Vikterna ovan är beräknade från ditt arbets‑1RM i kg och avrundas till närmaste {selected.rounding} kg.</li>
                  <li>Efter avslutat program: lägg in 2–3 lugnare veckor ≤80% av 1RM innan nästa cykel.</li>
                </ul>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        <div className="mt-6">
          Byggt för att efterlikna MM2K‑upplägget. Struktur och set/reps följer originalet; vikter räknas i kg via procent‑approximation.
        </div>
      </footer>
    </div>
  );
}

