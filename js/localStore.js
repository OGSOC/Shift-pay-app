// Persistence layer - everything the app stores (overrides, hours
// overrides, pay settings) lives in this browser's localStorage, on this
// device. There's no server and nothing syncs between devices: that's
// the whole point - nothing can wipe this out from under you the way a
// PaaS redeploy wiped server/data/db.json in the server-based version of
// this app. The real risks here are different ones: clearing this
// browser's site data, uninstalling the app, or switching devices/
// browsers all lose this data, since there's no backup copy anywhere
// else. See the README for an export/import workaround if you need one.
//
// Depends on dateKey() from dateutils.js and config.js's defaults - load
// both first.

const STORAGE_KEY = 'shiftPayApp.v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupted JSON or inaccessible storage (private browsing, blocked
    // site data, etc) - fall through to fresh defaults below rather than
    // crashing the whole app over it.
  }
  return {
    overrides: {}, // 'YYYY-MM-DD' -> { type: 'leave' } | { type: 'shift', shiftType: 'day' | 'night' }
    hoursOverrides: {}, // 'YYYY-MM-DD' -> { mode: 'times', start, end } | { mode: 'total', hours }
    paySettings: { hourlyRate: config.defaultHourlyRate, taxCode: config.defaultTaxCode },
  };
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storeData));
  } catch {
    // Storage full or blocked - changes stay live for this session (the
    // in-memory copy is still correct) but won't survive a reload. Rare
    // for this app's tiny data size, but silent failure here would be
    // more confusing than just accepting it.
  }
}

let storeData = loadData();

/**
 * Per-date overrides of the computed shift schedule: either 'leave' (block
 * the day off regardless of what the rota/office hours would say) or
 * 'shift' (an extra overtime shift, with the type - day or night - you
 * choose). Keyed by local 'YYYY-MM-DD' date string.
 */
function getOverride(key) {
  return storeData.overrides[key] || null;
}

function getAllOverrides() {
  return storeData.overrides;
}

function setOverride(key, override) {
  storeData.overrides[key] = override;
  saveData();
}

function clearOverride(key) {
  delete storeData.overrides[key];
  saveData();
}

/**
 * Per-date working-hours overrides, independent of (and layered on top
 * of) the leave/overtime override above - a normal rota day can have its
 * hours adjusted without changing its shift type, e.g. logging that a
 * scheduled 12h night shift actually ran to 13h. Either exact clock times
 * or a flat total-hours number.
 */
function getHoursOverride(key) {
  return storeData.hoursOverrides[key] || null;
}

function getAllHoursOverrides() {
  return storeData.hoursOverrides;
}

function setHoursOverride(key, override) {
  storeData.hoursOverrides[key] = override;
  saveData();
}

function clearHoursOverride(key) {
  delete storeData.hoursOverrides[key];
  saveData();
}

/**
 * Pay settings: hourly rate and UK tax code (for the net-pay estimate -
 * see ukTax.js). The pay period itself is not user-configured - it's
 * always the current calendar month, paid on the 11th of the following
 * month - see payCalc.js.
 */
function getPaySettings() {
  return storeData.paySettings;
}

function setPaySettings({ hourlyRate, taxCode } = {}) {
  if (hourlyRate !== undefined) storeData.paySettings.hourlyRate = hourlyRate;
  if (taxCode !== undefined) storeData.paySettings.taxCode = taxCode;
  saveData();
  return storeData.paySettings;
}

/**
 * Everything this app stores, as a JSON string - for copying between
 * devices or between a browser tab and the native app's own WebView
 * storage (they're separate, so nothing moves across on its own). See
 * importData() for the other direction.
 */
function exportData() {
  return JSON.stringify(storeData, null, 2);
}

/**
 * Restores a JSON string previously produced by exportData(), replacing
 * everything currently stored. Throws on malformed input or anything
 * that isn't shaped like this app's own data, so a stray paste can't
 * silently wipe real data.
 */
function importData(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That is not valid JSON - paste the exact text from Export.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.overrides !== 'object' ||
    typeof parsed.hoursOverrides !== 'object' ||
    typeof parsed.paySettings !== 'object'
  ) {
    throw new Error("That doesn't look like Shift & Pay data - paste the exact text from Export.");
  }
  storeData = parsed;
  saveData();
}

// ---- Validated actions (replace what used to be PUT route handlers) ----
// All of these throw a plain Error with a user-facing message on invalid
// input - callers (app.js) catch it and show err.message, same text the
// old API error responses used to carry.

const MAX_OVERRIDE_RANGE_DAYS = 60;
const OVERRIDE_TYPES = ['leave', 'day', 'night', 'clear'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Add/remove an overtime shift or block off leave for one date or a range. */
function applyOverrideRange(from, to, type) {
  if (!from || !OVERRIDE_TYPES.includes(type)) {
    throw new Error(`from is required and type must be one of ${OVERRIDE_TYPES.join(', ')}`);
  }
  const start = new Date(`${from}T00:00:00`);
  const end = to ? new Date(`${to}T00:00:00`) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('from/to must be YYYY-MM-DD dates');
  }
  if (end < start) {
    throw new Error('to must be on or after from');
  }
  const spanDays = Math.round((end - start) / 86400000) + 1;
  if (spanDays > MAX_OVERRIDE_RANGE_DAYS) {
    throw new Error(`range too large - max ${MAX_OVERRIDE_RANGE_DAYS} days`);
  }

  const updated = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d);
    if (type === 'clear') {
      clearOverride(key);
    } else if (type === 'leave') {
      setOverride(key, { type: 'leave' });
    } else {
      setOverride(key, { type: 'shift', shiftType: type });
    }
    updated.push(key);
  }
  return updated;
}

function getAllOverridesSorted() {
  return Object.entries(getAllOverrides())
    .map(([date, o]) => ({ date, ...o }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Set or clear a manual hours override for one date. */
function applyHoursOverride({ date, mode, start, end, hours }) {
  if (!date || !DATE_RE.test(date)) {
    throw new Error('date must be YYYY-MM-DD');
  }
  if (mode === 'clear') {
    clearHoursOverride(date);
    return;
  }
  if (mode === 'times') {
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
      throw new Error('start and end must be HH:mm');
    }
    setHoursOverride(date, { mode: 'times', start, end });
    return;
  }
  if (mode === 'total') {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      throw new Error('hours must be a number between 0 and 24');
    }
    setHoursOverride(date, { mode: 'total', hours: h });
    return;
  }
  throw new Error("mode must be 'times', 'total', or 'clear'");
}

/** Validates and applies pay settings updates (hourly rate and/or tax code). */
function updatePaySettings({ hourlyRate, taxCode } = {}) {
  const updates = {};
  if (hourlyRate !== undefined) {
    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('hourlyRate must be a positive number');
    }
    updates.hourlyRate = rate;
  }
  if (taxCode !== undefined) {
    const trimmed = String(taxCode).trim().toUpperCase();
    // Permissive on purpose - this only sanity-checks the shape (letters/
    // digits, a plausible length), it doesn't require a code ukTax.js
    // actually knows how to use. That's decided later, so storing a code
    // it can't interpret just means the pay cards show gross-only.
    if (trimmed && !/^[A-Z0-9]{1,10}$/.test(trimmed)) {
      throw new Error('taxCode must be a short letters/digits code (or blank)');
    }
    updates.taxCode = trimmed;
  }
  return setPaySettings(updates);
}
