// Pay period / gross+net pay calculations - depends on dateutils.js,
// shiftSchedule.js (getHoursForDate), localStore.js (getPaySettings),
// and ukTax.js (estimateNetPay). Load all of those first.

// The pay period is always a full calendar month (1st through the last
// day of that month) - not tied to any manually-entered date. Shared by
// both the live/cumulative summary and the full-period forecast below -
// they cover the same period, just different end points.
function getMonthBounds(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

// Payment date for the period covering `monthStart`'s calendar month: the
// 11th of the FOLLOWING month (JS's Date rolls month 12 into January of
// the next year automatically), moved back to the preceding Friday if
// that 11th falls on a Saturday or Sunday. e.g. all hours worked in
// September are paid on 11 October (or the Friday before, in a year
// where the 11th lands on a weekend).
function computePaymentDate(monthStart) {
  const d = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 11);
  const weekday = d.getDay(); // 0 = Sunday, 6 = Saturday
  if (weekday === 6) d.setDate(d.getDate() - 1); // Saturday -> preceding Friday
  if (weekday === 0) d.setDate(d.getDate() - 2); // Sunday -> preceding Friday
  return d;
}

function todayAtMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Whether the viewed period lies entirely before today ('past'), entirely
// after today ('future'), or is the month today falls in ('current') -
// tells the frontend which of the two result cards makes sense to show
// for a given viewed month (a "so far" total is meaningless for a month
// that hasn't started; a "forecast" is redundant for one that's over).
function getMonthStatus(periodStart, periodEnd, today) {
  if (periodEnd < today) return 'past';
  if (periodStart > today) return 'future';
  return 'current';
}

const BANK_HOLIDAY_RATE_MULTIPLIER = 2;

// Sums effective hours (override where set, else computed shift hours,
// leave always 0) for every date from `start` to `end` inclusive, along
// with which of those days are bank holidays - paid at
// BANK_HOLIDAY_RATE_MULTIPLIER x the normal rate, see computeGrossPay
// below. The override, when present, is whatever was actually recorded
// for that day (e.g. a corrected total after the fact) - the only
// "actual vs scheduled" distinction this app tracks - so a past month
// already reflects real hours wherever they were logged, falling back to
// the scheduled rota for any day that wasn't. Safe to call with start >
// end (e.g. a future month capped at today): the loop just doesn't run,
// giving 0 hours / no days, which is the correct "nothing earned yet".
function sumHoursInRange(start, end) {
  let totalHours = 0;
  let bankHolidayHours = 0;
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const info = getHoursForDate(d);
    totalHours += info.effectiveHours;
    if (info.effectiveHours > 0) {
      if (info.bankHoliday) bankHolidayHours += info.effectiveHours;
      days.push({ date: dateKey(d), hours: round2(info.effectiveHours), bankHoliday: info.bankHoliday });
    }
  }
  return { totalHours, bankHolidayHours, days };
}

// Gross pay for a set of day entries (as returned by sumHoursInRange):
// normal hours at hourlyRate, bank holiday hours at double that rate.
function computeGrossPay(days, hourlyRate) {
  const pay = days.reduce(
    (sum, day) => sum + day.hours * hourlyRate * (day.bankHoliday ? BANK_HOLIDAY_RATE_MULTIPLIER : 1),
    0
  );
  return round2(pay);
}

// Shapes the net-pay estimate (ukTax.js) for the pay card. When the
// stored tax code isn't a standard 'L'-suffix code the estimate can
// interpret (including blank), netPaySupported is false and the tax/NI/
// net fields are null - the frontend shows gross-only rather than a
// wrong net figure in that case.
function netPayFields(grossPay, taxCode) {
  const estimate = estimateNetPay(grossPay, taxCode);
  if (!estimate.supported) {
    return { taxCode: taxCode || null, netPaySupported: false, incomeTax: null, nationalInsurance: null, netPay: null };
  }
  return {
    taxCode,
    netPaySupported: true,
    taxYear: estimate.taxYear,
    incomeTax: round2(estimate.incomeTax),
    nationalInsurance: round2(estimate.nationalInsurance),
    netPay: round2(estimate.netPay),
  };
}

// Live/cumulative "earned so far" for the month `refDate` falls in,
// capped at today - only days that have actually happened count, even if
// later days in the month are already scheduled. For a past month this
// naturally equals the full-month total (every day is <= today); for a
// future month it's always 0 (nothing in it has happened yet) -
// monthStatus tells the frontend which framing applies, so it can show
// this as a real total for a past month and skip it entirely for a
// future one. Leave days count as 0 regardless of any hours override;
// everything else uses the override if set, else the computed shift
// hours. Gross/pre-tax estimate only - see the disclaimer in the UI.
function getPaySummary(refDate) {
  const settings = getPaySettings();
  const today = todayAtMidnight();
  const { start: periodStart, end: periodEnd } = getMonthBounds(refDate);
  const cappedEnd = today < periodEnd ? today : periodEnd;
  const paymentDate = computePaymentDate(periodStart);
  const monthStatus = getMonthStatus(periodStart, periodEnd, today);

  const { totalHours, bankHolidayHours, days } = sumHoursInRange(periodStart, cappedEnd);
  const grossPay = computeGrossPay(days, settings.hourlyRate);
  return {
    periodStart: dateKey(periodStart),
    periodEnd: dateKey(periodEnd),
    asOf: dateKey(today),
    paymentDate: dateKey(paymentDate),
    monthStatus,
    totalHours: round2(totalHours),
    bankHolidayHours: round2(bankHolidayHours),
    shiftCount: days.length,
    hourlyRate: settings.hourlyRate,
    grossPay,
    ...netPayFields(grossPay, settings.taxCode),
    days,
  };
}

// Full-period forecast for the month `refDate` falls in: the WHOLE
// calendar month's worth of hours, including days that haven't happened
// yet - a projection assuming currently scheduled shifts happen as
// planned, not a guarantee (labelled as such in the UI). Same period as
// getPaySummary, just not capped at today. The 4-on-4-off rota is a pure
// formula against a fixed anchor date with no upper bound, so this
// projects arbitrarily far into the future.
function getPayForecast(refDate) {
  const settings = getPaySettings();
  const today = todayAtMidnight();
  const { start: periodStart, end: periodEnd } = getMonthBounds(refDate);
  const paymentDate = computePaymentDate(periodStart);
  const monthStatus = getMonthStatus(periodStart, periodEnd, today);

  const { totalHours, bankHolidayHours, days } = sumHoursInRange(periodStart, periodEnd);
  const grossPay = computeGrossPay(days, settings.hourlyRate);
  return {
    periodStart: dateKey(periodStart),
    periodEnd: dateKey(periodEnd),
    paymentDate: dateKey(paymentDate),
    monthStatus,
    totalHours: round2(totalHours),
    bankHolidayHours: round2(bankHolidayHours),
    shiftCount: days.length,
    hourlyRate: settings.hourlyRate,
    grossPay,
    ...netPayFields(grossPay, settings.taxCode),
    days,
  };
}
