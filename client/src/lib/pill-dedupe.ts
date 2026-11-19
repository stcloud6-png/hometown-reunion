/**
 * Repeat-pill check (owner rule, 2026-11-19): a suggested interest pill is turned down if it
 * reuses ANY meaningful word of an existing pill, a MiEvento event, the Yacht Club or Napoli.
 * Accents, case, plurals and small spelling slips don't get around it; filler words don't count.
 */

export interface DedupeTarget {
  id: string;
  label: string;
  kind: "pill" | "event";
}

export interface DedupeHit {
  target: DedupeTarget;
  /** The word from the suggestion that matched, as typed. */
  word: string;
}

const FILLER = new Set([
  "87", "1987", "exclusive", "another", "the", "a", "an", "at", "of", "for", "and", "in", "on", "to",
  "with", "my", "our", "some", "day", "days", "night", "nights", "tour", "tours", "bus", "class",
  "group", "bhs", "czr", "panama", "trip", "event", "events", "go", "get", "let", "lets", "us",
  "up", "down", "out", "all", "more", "fun",
]);

function strip(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Same thing, different word. */
const ALIAS: Record<string, string> = {
  railroad: "railway", train: "railway", rail: "railway", boat: "cruise", ship: "cruise", sail: "sail",
  pizza: "napoli", pizzeria: "napoli", lock: "miraflore", canal: "canal",
};

function stem(w: string): string {
  const base = stemOnly(w);
  return ALIAS[base] ?? base;
}

function stemOnly(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Meaningful words, stemmed. */
export function words(label: string): string[] {
  return strip(label)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w) && w.length > 1)
    .map(stem);
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 5) return false;
  return lev(a, b) <= (n >= 8 ? 2 : 1);
}

/** Existing words plus neighbouring pairs glued together ("ping ding" -> "pingding"). */
function targetWords(label: string): string[] {
  const w = words(label);
  const glued = w.slice(1).map((x, i) => w[i] + x);
  return [...w, ...glued];
}

/** First existing pill/event the suggestion overlaps with, or null if it's new. */
export function findRepeat(suggestion: string, targets: DedupeTarget[]): DedupeHit | null {
  const typed = strip(suggestion).split(/[^a-z0-9]+/).filter(Boolean);
  const mine = words(suggestion);
  const gluedMine = mine.slice(1).map((x, i) => mine[i] + x);
  const candidates = [...mine, ...gluedMine];
  // Events first: if it's a MiEvento/class event, point there rather than at a pill.
  const ordered = [...targets.filter((t) => t.kind === "event"), ...targets.filter((t) => t.kind === "pill")];
  // Pass 1: exact word matches anywhere; pass 2: small spelling slips.
  for (const match of [(a: string, b: string) => a === b, similar]) {
    for (const target of ordered) {
      const theirs = targetWords(target.label);
      for (const w of candidates) {
        if (theirs.some((t) => match(w, t))) {
          const shown = typed.find((x) => stem(x) === w) ?? w;
          return { target, word: shown };
        }
      }
    }
  }
  return null;
}
