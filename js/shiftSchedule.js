// Shift rota computation - depends on config.js, dateutils.js,
// bankHolidays.js, and localStore.js (getOverride/getHoursOverride) -
// load all of those first.

const BLOCK_CYCLE_DAYS = 8; // 4 days on, 4 days off

function atMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function withTime(date, hours, minutes = 0) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * A manually added overtime shift or a day blocked off as leave, keyed by
 * calendar date and stored via localStore.js - always takes priority over
 * the computed office/rota schedule for that date.
 */
function getOverrideShift(date) {
  const override = getOverride(dateKey(date));
  if (!override) return null;

  if (override.type === 'leave') {
    return { shiftType: 'leave', source: 'override' };
  }

  const day = atMidnight(date);
  if (override.shiftType === 'night') {
    const next = addDays(day, 1);
    return { shiftType: 'night', start: withTime(day, 19, 0), end: withTime(next, 7, 0), source: 'override' };
  }
  return { shiftType: 'day', start: withTime(day, 7, 0), end: withTime(day, 19, 0), source: 'override' };
}

/**
 * Fixed Mon-Fri office hours before the shift rota begins
 * (config.preShiftStart .. config.preShiftEnd, inclusive).
 */
function getPreShiftDay(date) {
  const day = atMidnight(date);
  const start = atMidnight(new Date(config.preShiftStart));
  const end = atMidnight(new Date(config.preShiftEnd));
  if (day < start || day > end) return null;
  if (!isWeekday(day)) return null;

  return {
    shiftType: 'office',
    start: withTime(day, config.preShiftStartHour, 0),
    end: withTime(day, config.preShiftEndHour, 0),
    source: 'preshift',
  };
}

/**
 * The GSOC rota repeats every 8 days (4 on, 4 off), with day/night
 * alternating on every on-block. Given any date, finds which 8-day cycle
 * it falls in relative to config.shiftBlockAnchor and, if it's within the
 * first 4 days of that cycle, returns the on-block's start date and
 * shift type (day/night).
 */
function getBlockForDate(date) {
  const day = atMidnight(date);
  const anchor = atMidnight(new Date(config.shiftBlockAnchor));

  const diffDays = Math.round((day - anchor) / DAY_MS);
  const cycleIndex = Math.floor(diffDays / BLOCK_CYCLE_DAYS);
  const dayInCycle = mod(diffDays, BLOCK_CYCLE_DAYS);

  if (dayInCycle > 3) return null; // off day

  const blockStart = addDays(anchor, cycleIndex * BLOCK_CYCLE_DAYS);
  const isAnchorType = mod(cycleIndex, 2) === 0;
  const shiftType = isAnchorType ? config.shiftBlockAnchorType : (config.shiftBlockAnchorType === 'night' ? 'day' : 'night');

  return { blockStart, shiftType };
}

/**
 * Returns the shift instance (if any) that STARTS on the given calendar
 * date: a manual override (leave or an added overtime shift), an office
 * day, a day shift, a night shift, or null (day off / no rota data yet).
 */
function getShiftForDate(date) {
  const day = atMidnight(date);

  const override = getOverrideShift(day);
  if (override) return override;

  const preShift = getPreShiftDay(day);
  if (preShift) return preShift;

  const shiftStart = atMidnight(new Date(config.shiftStartDate));
  if (day < shiftStart) return null; // before the rota starts, and not a pre-shift office day

  const block = getBlockForDate(day);
  if (!block) return null; // off day

  // The block the rota starts in may already be underway (e.g. the rota's
  // anchor block starts before your actual first shift day) - clamp the
  // "effective" first day of that block to shiftStartDate so day-count
  // labels reflect what you actually work, not the full nominal block.
  const effectiveBlockStart = block.blockStart < shiftStart ? shiftStart : block.blockStart;
  const onDayNumber = Math.round((day - effectiveBlockStart) / DAY_MS) + 1;

  if (block.shiftType === 'night') {
    const next = addDays(day, 1);
    return {
      shiftType: 'night',
      onDayNumber,
      start: withTime(day, 19, 0),
      end: withTime(next, 7, 0),
      source: 'rota',
    };
  }

  return {
    shiftType: 'day',
    onDayNumber,
    start: withTime(day, 7, 0),
    end: withTime(day, 19, 0),
    source: 'rota',
  };
}

/**
 * Returns { date, onShift, isLeave, shift, bankHoliday } for `days`
 * consecutive calendar days starting `from`. A 'leave' override counts as
 * a day off (onShift is false) but is flagged separately so the UI can
 * label it as leave rather than a plain rota off-day. bankHoliday is the
 * England & Wales bank holiday name for that date, or null - independent
 * of onShift/isLeave, since a bank holiday can be worked, taken as leave,
 * or simply an off day like any other.
 */
function getScheduleWindow(days = 16, from = new Date()) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(atMidnight(from), i);
    const shift = getShiftForDate(date);
    const isLeave = shift?.shiftType === 'leave';
    const onShift = Boolean(shift) && !isLeave;
    out.push({ date, onShift, isLeave, shift: onShift ? shift : null, bankHoliday: getBankHolidayName(date) });
  }
  return out;
}

function getTodayStatus(from = new Date()) {
  const bankHoliday = getBankHolidayName(from);
  const shift = getShiftForDate(from);
  if (!shift) return { onShift: false, bankHoliday };
  if (shift.shiftType === 'leave') return { onShift: false, isLeave: true, bankHoliday };
  return { onShift: true, ...shift, bankHoliday };
}

/** Hours between two 'HH:mm' clock times, assuming an overnight span if end <= start. */
function hoursBetweenTimes(startStr, endStr) {
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return (endMin - startMin) / 60;
}

/**
 * Working hours for one date, for the pay calculator: computed from the
 * scheduled shift (office/day/night/overtime) by default, or from a
 * manual hours override if one is set for that date (either exact clock
 * times or a flat total). A day marked as leave always counts as 0 hours
 * for pay purposes, regardless of any hours override that might still be
 * stored underneath it (so clearing the leave override later correctly
 * brings the hours override back into effect rather than losing it).
 *
 * bankHoliday is the England & Wales bank holiday name for this date, or
 * null - the pay calculator (payCalc.js) pays double rate for any hours
 * actually worked (effectiveHours > 0) on a day this is set for,
 * regardless of shift type.
 */
function getHoursForDate(date) {
  const day = atMidnight(date);
  const shift = getShiftForDate(day);
  const isLeave = shift?.shiftType === 'leave';

  const computedHours = shift && !isLeave ? (shift.end.getTime() - shift.start.getTime()) / 3600000 : 0;

  const override = getHoursOverride(dateKey(day));
  const overrideHours = override
    ? (override.mode === 'total' ? override.hours : hoursBetweenTimes(override.start, override.end))
    : null;

  const effectiveHours = isLeave ? 0 : (overrideHours != null ? overrideHours : computedHours);

  return { date: day, shift, isLeave, computedHours, override, overrideHours, effectiveHours, bankHoliday: getBankHolidayName(day) };
}

/**
 * Full picture for one date - computed shift (or leave/off), computed
 * hours, and any active hours override - what the day-edit sheet needs to
 * show current state before you change anything. Mirrors what used to be
 * the server's GET /api/shift/day/:date response shape.
 */
function getDayInfo(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const info = getHoursForDate(date);
  return {
    date: dateStr,
    onShift: Boolean(info.shift) && !info.isLeave,
    isLeave: info.isLeave,
    shiftType: info.shift?.shiftType ?? null,
    shiftSource: info.shift?.source ?? null,
    start: info.shift?.start ?? null,
    end: info.shift?.end ?? null,
    computedHours: round2(info.computedHours),
    hoursOverride: info.override,
    effectiveHours: round2(info.effectiveHours),
    bankHoliday: info.bankHoliday,
  };
}
