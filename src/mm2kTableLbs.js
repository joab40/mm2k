// mm2kTableLbs.js
// v2025.12.26-01
//
// Datadrivet MM2K-upplägg för 14 pass med FT/Neg/Max-flaggor.
//  - Bas: procentmultiplar ≈ samma siffror som i tryckta tabellen (avrundade till 5 lb).
//  - Om du lägger in exakta rader från PDF-tabellen i EXACT_ROWS_LBS kommer de att användas i första hand.
//  - Helpers för kg (avrundning default 0.5 kg).

const VERSION = "v2025.12.26-01";

/**
 * Pass-metadata enligt workout-sheet:
 *  A/B/C = tre block i tabellen; reps anges här; 'ft' betyder att C är Failure Test;
 *  'neg' betyder excentriskt singelset (~110%); 'max' = max-test singel.
 *
 * Not: PDF-arket visar textraden under kolumnnumret (t.ex. "6 5 F" för W5).
 */
export const WORKOUT_META = [
  // idx 0 oanvänd för bekväm 1-baserad adress
  null,
  { id: 1,  name: "#1",  reps: { A: 8, B: 6, C: 5 }, flags: {} },
  { id: 2,  name: "#2",  reps: { A: 8, B: 5, C: 3 }, flags: {} },
  { id: 3,  name: "#3",  reps: { A: 8, B: 6, C: 5 }, flags: {} },
  { id: 4,  name: "#4",  reps: { A: 5, B: 3, C: 1 }, flags: {} }, // tung dag
  { id: 5,  name: "#5",  reps: { A: 6, B: 5, C: "FT" }, flags: { ft: true } },
  { id: 6,  name: "#6",  reps: { A: 3, B: 2, C: "Neg" }, flags: { neg: true } },
  { id: 7,  name: "#7",  reps: { A: 6, B: 5, C: "FT" }, flags: { ft: true } },
  { id: 8,  name: "#8",  reps: { A: 6, B: 3, C: "Neg" }, flags: { neg: true } },
  { id: 9,  name: "#9",  reps: { A: 6, B: 5, C: "FT" }, flags: { ft: true } },
  { id: 10, name: "#10", reps: { A: 3, B: 2, C: 1 }, flags: {} },  // tung
  { id: 11, name: "#11", reps: { A: 5, B: 3, C: "FT" }, flags: { ft: true } },
  { id: 12, name: "#12", reps: { A: 3, B: 2, C: 1 }, flags: {} },  // tung
  { id: 13, name: "#13", reps: { A: 5, B: 3, C: "FT" }, flags: { ft: true } },
  { id: 14, name: "#14", reps: { A: 3, B: 2, C: 1 }, flags: { max: true } }, // max-test
];

/**
 * Procentmultiplar för tabellens tre värden A/B/C per pass.
 * Dessa är valda för att matcha den tryckta progressionen (avrundad till 5 lb).
 * - FT-pass: C = FT-vikten och ska i tabellen vara samma siffra som B (därför "sameAsB: true")
 * - Neg-pass: C ≈ 110% (excentrisk singel)
 * - Max: #14 C ≈ 115% (mål-singel), A/B ligger strax lägre för att "stapla upp" mot max.
 *
 * Vill du istället använda EXAKTA rader (100–570 lb i 5-lb-steg) – fyll i EXACT_ROWS_LBS nedan.
 */
const PERCENTS = {
  // id: [A, B, C] i decimalform
  1:  [0.76, 0.80, 0.83],
  2:  [0.80, 0.85, 0.90],
  3:  [0.83, 0.88, 0.91],
  4:  [0.90, 0.95, 1.00],      // 5/3/1-lik tung dag
  5:  [0.87, 0.93, null],      // FT: C = same as B
  6:  [0.83, 0.90, 1.10],      // Neg: C ~ 110%
  7:  [0.90, 0.95, null],      // FT
  8:  [0.95, 1.00, 1.10],      // Neg
  9:  [0.91, 0.96, null],      // FT
  10: [0.98, 1.03, 1.06],      // Tung toppning
  11: [0.93, 0.98, null],      // FT
  12: [0.99, 1.04, 1.07],      // Tung toppning
  13: [0.95, 1.00, null],      // FT
  14: [1.05, 1.10, 1.15],      // Max-test (mål runt +15%)
};

// Markera vilka pass som har C = same-as-B (FT)
const FT_SAME_AS_B = new Set([5, 7, 9, 11, 13]);
// Markera Neg-pass (C=~110%)
const NEG_DAYS = new Set([6, 8]);

/**
 * EXAKTA rader från PDF-tabellen kan läggas här när du vill (1RM i lb => 14 kolumner à [A,B,C]).
 * Strukturen per rad:
 *   [ [A1,B1,C1], [A2,B2,C2], ... [A14,B14,C14] ]
 * Lägg till fler 1RM-nycklar för att skriva över procentlogiken för dessa.
 *
 * Nedan ett par exempelrader (100 lb och 250 lb) enligt skärmbildsreferenserna du gav.
 * Fyll på när du vill – modulen plockar alltid EXAKT rad i första hand.
 */
export const EXACT_ROWS_LBS = {
  100: [
    [65, 70, 75],   // W1
    [70, 75, 80],   // W2
    [75, 80, 85],   // W3
    [80, 90, 100],  // W4
    [87, 93, 93],   // W5 (FT: C=B)
    [85, 90, 110],  // W6 (Neg ~110%)
    [90, 95, 95],   // W7 (FT)
    [95, 100, 110], // W8 (Neg)
    [90, 95, 95],   // W9 (FT)
    [100, 105, 110],// W10
    [93, 98, 98],   // W11 (FT)
    [101, 106, 110],// W12
    [95, 100, 100], // W13 (FT)
    [105, 110, 115] // W14 Max
  ],
  250: [
    [160, 180, 195],
    [175, 190, 205],
    [185, 200, 215],
    [200, 215, 250],
    [215, 235, 235],   // FT: C=B
    [205, 225, 275],   // Neg
    [225, 240, 240],   // FT
    [235, 250, 275],   // Neg
    [225, 240, 240],   // FT
    [245, 260, 275],
    [235, 250, 250],   // FT
    [250, 265, 275],
    [240, 255, 255],   // FT
    [260, 275, 290],   // Max-top
  ],
};

export const SUPPORTED_RM_LBS = Object.keys(EXACT_ROWS_LBS)
  .map(Number)
  .sort((a, b) => a - b);

// ---------- Avrundningshjälp ----------

function roundTo5lbs(x) {
  const v = Math.round(x / 5) * 5;
  // undvik 0 eller negativa på låga ingångsvärden
  return Math.max(0, v);
}

let KG_STEP = 0.5; // default avrundning i appen
export function setKgRounding(stepKg) {
  const s = Number(stepKg);
  if (Number.isFinite(s) && s > 0) KG_STEP = s;
}
function lbsToKg(lbs) {
  return lbs * 0.45359237;
}
function roundKg(x) {
  return Math.round(x / KG_STEP) * KG_STEP;
}

// ---------- Beräkning via multiplar (fallback när exakt rad saknas) ----------

function computeRowByPerc(oneRmLbs, workoutId) {
  const [pa, pb, pc] = PERCENTS[workoutId];
  const A = roundTo5lbs(oneRmLbs * pa);
  const B = roundTo5lbs(oneRmLbs * pb);
  let C;
  if (FT_SAME_AS_B.has(workoutId)) {
    C = B; // FT: samma vikt som B
  } else if (NEG_DAYS.has(workoutId)) {
    C = roundTo5lbs(oneRmLbs * pc); // ~110%
  } else {
    C = roundTo5lbs(oneRmLbs * pc);
  }
  return [A, B, C];
}

function computeAllRowsByPerc(oneRmLbs) {
  const out = [];
  for (let w = 1; w <= 14; w++) {
    out.push(computeRowByPerc(oneRmLbs, w));
  }
  return out;
}

// ---------- Publika API:er ----------

/**
 * Hämta plan i pounds (lbs). Returnerar en array med 14 objekt:
 *  { workoutId, name, reps, flags, A, B, C }
 * Använder exakt tabellrad om tillgänglig, annars procent-fallback.
 */
export function getPlanLbs(oneRmLbsInput) {
  const oneRmLbs = Math.round(Number(oneRmLbsInput));
  if (!Number.isFinite(oneRmLbs) || oneRmLbs <= 0) {
    throw new Error("oneRmLbs måste vara > 0");
  }

  // 1) Finns exakt rad?
  let row = EXACT_ROWS_LBS[oneRmLbs];
  // 2) annars – ta närmaste exakta rad om den är väldigt nära (±2 lb), annars fallback på multiplar
  if (!row && SUPPORTED_RM_LBS.length > 0) {
    let best = null, bestDiff = Infinity;
    for (const r of SUPPORTED_RM_LBS) {
      const d = Math.abs(r - oneRmLbs);
      if (d < bestDiff) { best = r; bestDiff = d; }
    }
    if (best !== null && bestDiff <= 2) {
      row = EXACT_ROWS_LBS[best];
    }
  }
  const rows = row || computeAllRowsByPerc(oneRmLbs);

  // Forma utdataobjekt per pass:
  const out = [];
  for (let w = 1; w <= 14; w++) {
    const [A, B, C] = rows[w - 1]; // [A,B,C]
    out.push({
      workoutId: w,
      name: WORKOUT_META[w].name,
      reps: WORKOUT_META[w].reps,
      flags: WORKOUT_META[w].flags,
      A, B, C,
    });
  }
  return out;
}

/**
 * Hämta plan i kg. Använder oneRm i kg, men räknar via lbs under huven
 * (detta gör att EXAKTA tabellrader från PDF:en återges korrekt).
 */
export function getPlanKg(oneRmKgInput) {
  const oneRmKg = Number(oneRmKgInput);
  if (!Number.isFinite(oneRmKg) || oneRmKg <= 0) {
    throw new Error("oneRmKg måste vara > 0");
  }
  // konvertera till närmaste heltals-lbs för tabelluppslag
  const oneRmLbs = Math.round(oneRmKg / 0.45359237);
  const planLbs = getPlanLbs(oneRmLbs);

  return planLbs.map((p) => {
    const Akg = roundKg(lbsToKg(p.A));
    const Bkg = roundKg(lbsToKg(p.B));
    const Ckg = roundKg(lbsToKg(p.C));
    return {
      workoutId: p.workoutId,
      name: p.name,
      reps: p.reps,
      flags: p.flags,
      Akg, Bkg, Ckg,
      // för referens kan man även skicka med lbs:
      Albs: p.A, Blbs: p.B, Clbs: p.C,
    };
  });
}

// Lite metadata för UI/debug
export const MM2K_TABLE_INFO = {
  version: VERSION,
  kgRoundingStep: () => KG_STEP,
  hasExactRow: (rmLbs) => Boolean(EXACT_ROWS_LBS[Math.round(rmLbs)]),
};
