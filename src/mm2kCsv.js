// src/mm2kCsv.js
// Laddar och tolkar mm2k.csv (lbs) -> karta per 1RM och pass 1..14 (A,B,C)

const LBS_TO_KG = 0.45359237;

export function lbsToKg(lbs, stepKg = 2.5) {
  const n = Number(lbs);
  if (!Number.isFinite(n)) return null;
  const kg = n * LBS_TO_KG;
  const s = Number(stepKg) || 0.5;
  return Math.round(kg / s) * s;
}

function detectDelimiter(headerLine) {
  if (headerLine.includes(";")) return ";";
  if (headerLine.includes("\t")) return "\t";
  return ","; // default
}

function normalize(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\-._]/g, "");
}

/**
 * Stödjer rubriker:
 * - 1RM, IRM, rm, max
 * - 1A / 1B / 1C, 2A … 14C
 * - W1A, W1_A, 1_A, 1-A, "1 A"
 */
function buildColumnMap(headers) {
  const idx = {
    oneRm: -1,
    w: Array.from({ length: 14 }, () => ({ A: -1, B: -1, C: -1 })),
  };

  headers.forEach((raw, i) => {
    const h = normalize(raw);
    if (idx.oneRm === -1 && /(^|[^a-z])1rm([^a-z]|$)|^irm$|^rm$|^max$/.test(h)) {
      idx.oneRm = i;
      return;
    }

    // Matcha pass + block
    // Ex: "1a", "w1a", "1_a", "1-a", "1 a"
    const m = h.match(/^(?:w)?(\d{1,2})[_\- ]?([abc])$/) || h.match(/^(\d{1,2})([abc])$/);
    if (m) {
      const w = Number(m[1]);
      const part = m[2]?.toUpperCase();
      if (w >= 1 && w <= 14 && (part === "A" || part === "B" || part === "C")) {
        idx.w[w - 1][part] = i;
      }
    }
  });

  if (idx.oneRm === -1) {
    throw new Error("Hittar inte 1RM-kolumn (t.ex. 1RM / IRM / RM / Max).");
  }
  // Minst några kolumner för 1A..14C bör finnas
  const anyCol = idx.w.some(rec => rec.A >= 0 || rec.B >= 0 || rec.C >= 0);
  if (!anyCol) throw new Error("Hittar inga W#A/B/C-kolumner (t.ex. 1A, 1B, 1C ...).");

  return idx;
}

function tokenizeLine(line, delim) {
  // enkel CSV (utan citattecken-nesting). Räcker för vår tabell.
  return line.split(delim).map(s => s.trim());
}

export function parseMm2kCsv(csvText) {
  const lines = String(csvText || "").split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV verkar sakna data.");

  const delim = detectDelimiter(lines[0]);
  const header = tokenizeLine(lines[0], delim);
  const mapIdx = buildColumnMap(header);

  const planLbs = new Map(); // key: 1RM lbs (number) -> Array(14) of {A,B,C}

  for (let i = 1; i < lines.length; i++) {
    const cells = tokenizeLine(lines[i], delim);
    const oneRmStr = cells[mapIdx.oneRm] || "";
    const oneRm = Number(oneRmStr);
    if (!Number.isFinite(oneRm)) continue;

    const row = Array.from({ length: 14 }, (_, k) => {
      const rec = mapIdx.w[k];
      const A = rec.A >= 0 ? Number(cells[rec.A] || "") : NaN;
      const B = rec.B >= 0 ? Number(cells[rec.B] || "") : NaN;
      const C = rec.C >= 0 ? Number(cells[rec.C] || "") : NaN;
      return {
        A: Number.isFinite(A) ? A : null,
        B: Number.isFinite(B) ? B : null,
        C: Number.isFinite(C) ? C : null,
      };
    });

    planLbs.set(oneRm, row);
  }

  if (planLbs.size === 0) throw new Error("Inga rader kunde tolkas som 1RM.");

  const sortedKeys = Array.from(planLbs.keys()).sort((a,b)=>a-b);
  return { planLbs, keys: sortedKeys, min: sortedKeys[0], max: sortedKeys[sortedKeys.length-1] };
}

/**
 * Laddar /mm2k.csv (lägg filen i public/) och returnerar { planLbs, keys, min, max }.
 */
export async function loadMm2kCsv(url = "/mm2k.csv") {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Kunde inte läsa ${url}`);
  const text = await r.text();
  return parseMm2kCsv(text);
}

/**
 * Hämtar en rad (pass 1..14) för närmaste 1RM (lbs), och returnerar kg med avrundning.
 * workingRmKg -> planKg[14] = { Akg, Bkg, Ckg }
 */
export function getPlanFromCsvKg(plan, workingRmKg, stepKg = 2.5) {
  if (!plan || !plan.planLbs) return [];

  const lbs = workingRmKg / LBS_TO_KG;
  const nearest5 = Math.round(lbs / 5) * 5;
  const clamped = Math.max(plan.min, Math.min(plan.max, nearest5));

  const row = plan.planLbs.get(clamped);
  if (!row) return [];

  return row.map(({ A, B, C }) => ({
    Akg: A != null ? lbsToKg(A, stepKg) : null,
    Bkg: B != null ? lbsToKg(B, stepKg) : null,
    Ckg: C != null ? lbsToKg(C, stepKg) : null,
  }));
}
