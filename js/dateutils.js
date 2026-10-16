// Shared constants/helpers used by more than one of the other plain
// scripts - defined once here (loaded first) rather than repeated, since
// a top-level `const`/`let` redeclared in a later classic script is a
// hard SyntaxError that breaks every script after it, not just a harmless
// shadow (unlike `function`, which silently tolerates it).

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Local (not UTC) 'YYYY-MM-DD' key - the single shared format every other
// module uses to key overrides/hours-overrides and to compare dates.
// Accepts a Date or anything new Date() accepts (an ISO string, etc).
function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
