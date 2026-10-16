/**
 * England & Wales bank holidays, computed from the standard fixed rules -
 * no external data source or upkeep needed, and (like the 4-on-4-off rota
 * in shiftSchedule.js) this works for any year, arbitrarily far into the
 * future, which the pay forecast relies on.
 *
 * This covers the 8 standard annual bank holidays and their weekend
 * substitution rules. It does NOT know about one-off additional holidays
 * that get announced separately from the standard calendar (e.g. a
 * coronation or jubilee bank holiday) - those aren't derivable from any
 * fixed rule, so they won't be highlighted or paid at double rate unless
 * this list is extended by hand for that specific date.
 *
 * Depends on dateKey()/DAY_MS from dateutils.js - load that first.
 */

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for the date of Easter Sunday. */
function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** The nth (1-indexed) occurrence of `weekday` (0=Sun..6=Sat) in a month. */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday) {
      count += 1;
      if (count === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
}

/** The last occurrence of `weekday` (0=Sun..6=Sat) in a month. */
function lastWeekdayOfMonth(year, month, weekday) {
  const d = new Date(year, month + 1, 0); // last day of month
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** New Year's Day (1 Jan), moved to the following Monday if it falls on a weekend. */
function newYearsDay(year) {
  const d = new Date(year, 0, 1);
  const weekday = d.getDay();
  if (weekday === 6) return new Date(year, 0, 3); // Sat -> Mon
  if (weekday === 0) return new Date(year, 0, 2); // Sun -> Mon
  return d;
}

/**
 * Christmas Day and Boxing Day, substituted together per the official
 * rule: Boxing Day keeps its own natural weekday slot even if Christmas
 * Day has to move past it, and each only moves forward as far as needed
 * to land on the next free weekday.
 */
function christmasAndBoxingDay(year) {
  const weekday = new Date(year, 11, 25).getDay();
  switch (weekday) {
    case 5: // Fri: Christmas stays, Boxing Day (Sat) -> Mon 28th
      return [new Date(year, 11, 25), new Date(year, 11, 28)];
    case 6: // Sat: Christmas -> Mon 27th, Boxing Day (Sun) -> Tue 28th
      return [new Date(year, 11, 27), new Date(year, 11, 28)];
    case 0: // Sun: Christmas -> Tue 27th (skipping Boxing Day's Mon 26th), Boxing Day stays
      return [new Date(year, 11, 27), new Date(year, 11, 26)];
    default: // Mon-Thu: neither needs to move
      return [new Date(year, 11, 25), new Date(year, 11, 26)];
  }
}

const bankHolidayYearCache = new Map();

/** All 8 standard England & Wales bank holidays for a given year, as { date, name }. */
function getBankHolidaysForYear(year) {
  if (bankHolidayYearCache.has(year)) return bankHolidayYearCache.get(year);

  const easterSunday = computeEasterSunday(year);
  const goodFriday = new Date(easterSunday.getTime() - 2 * DAY_MS);
  const easterMonday = new Date(easterSunday.getTime() + 1 * DAY_MS);
  const [christmasDay, boxingDay] = christmasAndBoxingDay(year);

  const holidays = [
    { date: newYearsDay(year), name: "New Year's Day" },
    { date: goodFriday, name: 'Good Friday' },
    { date: easterMonday, name: 'Easter Monday' },
    { date: nthWeekdayOfMonth(year, 4, 1, 1), name: 'Early May bank holiday' },
    { date: lastWeekdayOfMonth(year, 4, 1), name: 'Spring bank holiday' },
    { date: lastWeekdayOfMonth(year, 7, 1), name: 'Summer bank holiday' },
    { date: christmasDay, name: 'Christmas Day' },
    { date: boxingDay, name: 'Boxing Day' },
  ];

  bankHolidayYearCache.set(year, holidays);
  return holidays;
}

/** The bank holiday name for a given date, or null if it isn't one. */
function getBankHolidayName(date) {
  const key = dateKey(date);
  const match = getBankHolidaysForYear(date.getFullYear()).find((h) => dateKey(h.date) === key);
  return match ? match.name : null;
}
