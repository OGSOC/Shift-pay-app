const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function timeFmt(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ---------- shared month-grid calendar ----------

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGridDates(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(year, month, 1 - startWeekday);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const dates = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// cellHtmlFn(date, key, inCurrentMonth, isToday) -> cell HTML string
function renderMonthGrid(container, year, month, cellHtmlFn) {
  const dates = monthGridDates(year, month);
  const todayKey = dateKey(new Date());
  const header = WEEKDAY_LABELS.map((w) => `<div class="cal-weekday">${w}</div>`).join('');
  const cells = dates.map((d) => {
    const key = dateKey(d);
    return cellHtmlFn(d, key, d.getMonth() === month, key === todayKey);
  }).join('');
  container.innerHTML = header + cells;
}

function monthTitle(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ---------- navigation ----------

function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'today') loadToday();
  if (name === 'settings') loadOverridesList();
}

$$('.nav-btn').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));

// ---------- Today ----------

const SHIFT_LABELS = {
  office: { css: 'warn', label: 'OFFICE HOURS' },
  day: { css: 'ok', label: 'DAY SHIFT' },
  night: { css: 'warn', label: 'NIGHT SHIFT' },
};

function shiftBadge(shiftType) {
  const info = SHIFT_LABELS[shiftType] || { css: 'off', label: shiftType };
  return info;
}

function loadToday() {
  const card = $('#today-card');
  try {
    const today = getTodayStatus();
    const holidayBadge = today.bankHoliday ? `<span class="badge holiday">${today.bankHoliday}</span>` : '';
    if (!today.onShift) {
      const badge = today.isLeave
        ? '<span class="badge leave">ANNUAL LEAVE</span>'
        : '<span class="badge off">OFF TODAY</span>';
      card.innerHTML = `${badge}${holidayBadge}<p>No shift today. Enjoy your day off.</p>`;
    } else {
      const badge = shiftBadge(today.shiftType);
      const dayCount = today.shiftType === 'office' ? '' : ` - day ${today.onDayNumber}/4`;
      const overtimeTag = today.source === 'override' ? ' (overtime)' : '';
      const payNote = today.bankHoliday ? '<p class="muted">Bank holiday &mdash; paid at double rate.</p>' : '';
      card.innerHTML = `
        <span class="badge ${badge.css}">${badge.label}${dayCount}${overtimeTag}</span>${holidayBadge}
        <p>${timeFmt(today.start)} &ndash; ${timeFmt(today.end)}</p>
        ${payNote}
      `;
    }
  } catch (err) {
    card.textContent = `Could not load today's status: ${err.message}`;
  }

  loadShiftCalendar();
  loadPaySettings();
  loadPayCards();
}

// ---------- Shift calendar ----------

const todayForCal = new Date();
let shiftCalYear = todayForCal.getFullYear();
let shiftCalMonth = todayForCal.getMonth();

function shiftCellClass(day) {
  if (day.isLeave) return 'status-leave';
  if (!day.onShift) return '';
  return `status-${day.shift.shiftType}`;
}

function loadShiftCalendar() {
  const container = $('#shift-calendar');
  $('#shift-cal-title').textContent = monthTitle(shiftCalYear, shiftCalMonth);

  const dates = monthGridDates(shiftCalYear, shiftCalMonth);

  try {
    const days = getScheduleWindow(dates.length, dates[0]);
    const byKey = new Map(days.map((d) => [dateKey(d.date), d]));

    renderMonthGrid(container, shiftCalYear, shiftCalMonth, (date, key, inMonth, isToday) => {
      const day = byKey.get(key);
      const statusClass = day ? shiftCellClass(day) : '';
      const overtimeClass = day?.onShift && day.shift.source === 'override' ? ' status-overtime' : '';
      const outsideClass = inMonth ? '' : ' outside';
      const todayClass = isToday ? ' today' : '';
      const holidayClass = day?.bankHoliday ? ' bank-holiday' : '';
      const holidayTitle = day?.bankHoliday ? ` title="${day.bankHoliday}"` : '';
      return `
        <div class="cal-cell ${statusClass}${overtimeClass}${outsideClass}${todayClass}${holidayClass}" data-date="${key}"${holidayTitle}>
          <span class="cal-daynum">${date.getDate()}</span>
        </div>
      `;
    });
  } catch (err) {
    container.innerHTML = `<p class="muted">Could not load calendar: ${err.message}</p>`;
  }
}

$('#shift-calendar').addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-cell');
  if (!cell) return;
  openDayModal(cell.dataset.date);
});

$('#shift-cal-prev').addEventListener('click', () => {
  shiftCalMonth -= 1;
  if (shiftCalMonth < 0) { shiftCalMonth = 11; shiftCalYear -= 1; }
  loadShiftCalendar();
});
$('#shift-cal-next').addEventListener('click', () => {
  shiftCalMonth += 1;
  if (shiftCalMonth > 11) { shiftCalMonth = 0; shiftCalYear += 1; }
  loadShiftCalendar();
});

// ---------- Pay period ----------
//
// The period itself isn't user-configured: it's always a calendar month,
// paid on the 11th of the following month (the preceding Friday if that
// 11th falls on a weekend) - see payCalc.js. The only setting here is the
// hourly rate. Arrows navigate between months; it opens on the current
// month on every page load, since payCalYear/payCalMonth are
// (re-)initialised from today's date each time this script runs, and
// nothing resets them on its own after that - only the prev/next
// handlers below change them.

const todayForPay = new Date();
let payCalYear = todayForPay.getFullYear();
let payCalMonth = todayForPay.getMonth();

function loadPaySettings() {
  const settings = getPaySettings();
  $('#hourly-rate-input').value = settings.hourlyRate;
  $('#tax-code-input').value = settings.taxCode || '';
}

function shiftCountLabel(n) {
  return `${n} shift${n === 1 ? '' : 's'}`;
}

// Fills one of the two result cards. `asOf` is only passed for the live
// "earned so far" card - the forecast card never shows one, since it
// deliberately isn't capped at today.
function renderPayCard(elId, data, { label, badgeClass, badgeText, asOf }) {
  const el = $(`#${elId}`);
  const labelEl = el.parentElement.querySelector('.pay-card-label');
  labelEl.innerHTML = `${label} <span class="badge ${badgeClass}">${badgeText}</span>`;
  if (typeof data.grossPay !== 'number' || typeof data.hourlyRate !== 'number') {
    // Defense in depth against a malformed/unexpected data shape - never
    // let it reach .toFixed() on something undefined.
    el.textContent = 'Could not load pay data — try reloading the page.';
    return;
  }
  const asOfPart = asOf ? ` (as of ${data.asOf})` : '';
  const holidayPart = data.bankHolidayHours
    ? `<br><span class="muted">Includes ${data.bankHolidayHours}h at double rate (bank holiday)</span>`
    : '';
  const netPart = data.netPaySupported && typeof data.netPay === 'number'
    ? ` &middot; <strong>&pound;${data.netPay.toFixed(2)}</strong> est. net`
    : '';
  const netNote = netPart
    ? `<br><span class="muted">Est. net after Income Tax + NI only (tax code ${data.taxCode}, ${data.taxYear}) &mdash; doesn't account for pension, student loan, or other deductions</span>`
    : '<br><span class="muted">Set a tax code in Settings to see an estimated net pay</span>';
  el.innerHTML = `${data.periodStart} &ndash; ${data.periodEnd}${asOfPart}<br>` +
    `<strong>${shiftCountLabel(data.shiftCount)}</strong> &middot; <strong>${data.totalHours}h</strong> &middot; ` +
    `<strong>&pound;${data.grossPay.toFixed(2)}</strong> gross${netPart} @ &pound;${data.hourlyRate.toFixed(2)}/h<br>` +
    `<span class="muted">Paid ${data.paymentDate}</span>${holidayPart}${netNote}`;
}

// Loads both cards for whatever month payCalYear/payCalMonth currently
// point at, then shows/labels them for that month's status:
// - current (today's month, the default): both cards - "Earned so far"
//   (capped at today) and "Full period forecast".
// - past (fully elapsed): only one card, showing the real final total -
//   "so far" and "forecast" would be identical numbers here, so showing
//   both would just be redundant.
// - future (hasn't started): only one card, the forecast - "earned so
//   far" is always zero for a month with no days behind it yet, so
//   there's nothing useful for that card to show.
function loadPayCards() {
  $('#pay-month-title').textContent = monthTitle(payCalYear, payCalMonth);
  const refDate = new Date(payCalYear, payCalMonth, 1);
  const liveCard = $('#pay-card-live');
  const forecastCard = $('#pay-card-forecast');

  try {
    const summary = getPaySummary(refDate);
    const forecast = getPayForecast(refDate);

    if (summary.monthStatus === 'past') {
      liveCard.classList.remove('hidden');
      forecastCard.classList.add('hidden');
      renderPayCard('pay-summary', summary, { label: 'Total earned', badgeClass: 'ok', badgeText: 'final', asOf: false });
    } else if (summary.monthStatus === 'future') {
      liveCard.classList.add('hidden');
      forecastCard.classList.remove('hidden');
      renderPayCard('pay-forecast', forecast, { label: 'Forecast', badgeClass: 'office', badgeText: 'projection', asOf: false });
    } else {
      liveCard.classList.remove('hidden');
      forecastCard.classList.remove('hidden');
      renderPayCard('pay-summary', summary, { label: 'Earned so far', badgeClass: 'ok', badgeText: 'live', asOf: true });
      renderPayCard('pay-forecast', forecast, { label: 'Full period forecast', badgeClass: 'office', badgeText: 'projection', asOf: false });
    }
  } catch (err) {
    liveCard.classList.remove('hidden');
    forecastCard.classList.add('hidden');
    $('#pay-summary').textContent = `Could not load pay data: ${err.message}`;
  }
}

$('#pay-month-prev').addEventListener('click', () => {
  payCalMonth -= 1;
  if (payCalMonth < 0) { payCalMonth = 11; payCalYear -= 1; }
  loadPayCards();
});
$('#pay-month-next').addEventListener('click', () => {
  payCalMonth += 1;
  if (payCalMonth > 11) { payCalMonth = 0; payCalYear += 1; }
  loadPayCards();
});

$('#save-pay-settings').addEventListener('click', () => {
  const rateRaw = $('#hourly-rate-input').value;
  const body = {};
  if (rateRaw) body.hourlyRate = Number(rateRaw);

  try {
    updatePaySettings(body);
  } catch (err) {
    alert(`Could not save pay settings: ${err.message}`);
    return;
  }
  loadPaySettings();
  loadPayCards();
});

$('#save-tax-code').addEventListener('click', () => {
  const taxCode = $('#tax-code-input').value;
  try {
    updatePaySettings({ taxCode });
  } catch (err) {
    alert(`Could not save tax code: ${err.message}`);
    return;
  }
  alert('Tax code saved.');
  // The Today tab's pay cards show the net-pay estimate, which depends
  // on this - refresh them so a change here is reflected immediately,
  // not just on the next unrelated reload.
  loadPayCards();
});

// ---------- Overtime & leave overrides ----------

function applyOverride(from, to, type) {
  try {
    applyOverrideRange(from, to, type);
    return true;
  } catch (err) {
    alert(`Could not update schedule: ${err.message}`);
    return false;
  }
}

let modalDate = null;

function openDayModal(date) {
  modalDate = date;
  $('#day-modal-title').textContent = `Edit ${date}`;
  resetHoursForm();
  $('#day-modal').classList.remove('hidden');

  try {
    const info = getDayInfo(date);
    renderDayModalStatus(info);
    populateHoursForm(info);
  } catch (err) {
    $('#day-modal-status').textContent = `Could not load day info: ${err.message}`;
  }
}

function closeDayModal() {
  modalDate = null;
  $('#day-modal').classList.add('hidden');
}

function renderDayModalStatus(info) {
  const el = $('#day-modal-status');
  const holidayNote = info.bankHoliday ? ` [${info.bankHoliday} - bank holiday]` : '';
  if (info.isLeave) {
    el.textContent = `Annual leave - 0 hours for pay purposes.${holidayNote}`;
    return;
  }
  if (!info.onShift) {
    el.textContent = `Off - no scheduled shift.${holidayNote}`;
    return;
  }
  const badge = shiftBadge(info.shiftType);
  const overtimeTag = info.shiftSource === 'override' ? ' (overtime)' : '';
  const overrideNote = info.hoursOverride
    ? ` - manual override in effect: ${info.effectiveHours}h`
    : '';
  const payNote = info.bankHoliday ? ` - paid at double rate (${info.bankHoliday})` : '';
  el.textContent = `${badge.label}${overtimeTag}: ${timeFmt(info.start)}-${timeFmt(info.end)} (${info.computedHours}h computed)${overrideNote}${payNote}`;
}

$('#day-modal-close').addEventListener('click', closeDayModal);

$$('#day-modal .modal-actions button').forEach((btn) => btn.addEventListener('click', () => {
  if (!modalDate) return;
  const ok = applyOverride(modalDate, modalDate, btn.dataset.type);
  closeDayModal();
  if (ok) {
    loadToday();
    loadOverridesList();
  }
}));

// ---------- Hours override (within the day modal) ----------

let hoursMode = 'times';

function setHoursMode(mode) {
  hoursMode = mode;
  $('#hours-mode-times').classList.toggle('active', mode === 'times');
  $('#hours-mode-total').classList.toggle('active', mode === 'total');
  $('#hours-times-fields').classList.toggle('hidden', mode !== 'times');
  $('#hours-total-fields').classList.toggle('hidden', mode !== 'total');
}

function resetHoursForm() {
  setHoursMode('times');
  $('#hours-start').value = '';
  $('#hours-end').value = '';
  $('#hours-total').value = '';
}

function populateHoursForm(info) {
  if (info.hoursOverride?.mode === 'total') {
    setHoursMode('total');
    $('#hours-total').value = info.hoursOverride.hours;
  } else if (info.hoursOverride?.mode === 'times') {
    setHoursMode('times');
    $('#hours-start').value = info.hoursOverride.start;
    $('#hours-end').value = info.hoursOverride.end;
  } else if (info.start && info.end) {
    // Prefill with the computed shift times as a sensible starting point.
    setHoursMode('times');
    $('#hours-start').value = timeFmt(info.start);
    $('#hours-end').value = timeFmt(info.end);
  }
}

$('#hours-mode-times').addEventListener('click', () => setHoursMode('times'));
$('#hours-mode-total').addEventListener('click', () => setHoursMode('total'));

$('#save-hours-btn').addEventListener('click', () => {
  if (!modalDate) return;
  const body = { date: modalDate, mode: hoursMode };
  if (hoursMode === 'times') {
    body.start = $('#hours-start').value;
    body.end = $('#hours-end').value;
    if (!body.start || !body.end) {
      alert('Set both a start and end time.');
      return;
    }
  } else {
    const hours = $('#hours-total').value;
    if (!hours) {
      alert('Enter total hours.');
      return;
    }
    body.hours = Number(hours);
  }

  try {
    applyHoursOverride(body);
  } catch (err) {
    alert(`Could not save hours: ${err.message}`);
    return;
  }
  closeDayModal();
  loadToday();
});

$('#clear-hours-btn').addEventListener('click', () => {
  if (!modalDate) return;
  applyHoursOverride({ date: modalDate, mode: 'clear' });
  closeDayModal();
  loadToday();
});

$('#apply-override').addEventListener('click', () => {
  const from = $('#override-from').value;
  const to = $('#override-to').value;
  const type = $('#override-type').value;
  if (!from) {
    alert('Pick a from date.');
    return;
  }
  const ok = applyOverride(from, to || undefined, type);
  if (ok) {
    alert('Schedule updated.');
    loadToday();
    loadOverridesList();
  }
});

const OVERRIDE_LABELS = {
  leave: 'Annual leave',
  shift: 'Overtime',
};

function loadOverridesList() {
  const list = $('#overrides-list');
  try {
    const overrides = getAllOverridesSorted();
    list.innerHTML = overrides.map((o) => {
      const label = o.type === 'leave' ? OVERRIDE_LABELS.leave : `${OVERRIDE_LABELS.shift} (${o.shiftType})`;
      return `
        <div class="card override-row">
          <span>${o.date} - ${label}</span>
          <button class="clear-override-btn" data-date="${o.date}">Clear</button>
        </div>
      `;
    }).join('') || '<p class="muted">No overtime or leave set.</p>';
  } catch (err) {
    list.textContent = `Could not load overrides: ${err.message}`;
  }
}

$('#overrides-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.clear-override-btn');
  if (!btn) return;
  clearOverride(btn.dataset.date);
  loadOverridesList();
  loadToday();
});

// ---------- boot ----------

// Registers the service worker for offline support and forces an
// immediate update check (bypassing the browser's own ~24h default
// check interval), auto-reloading once if a newer version takes over an
// already-open page - the same proven pattern used to fix repeated
// stale-cache bugs in the earlier, server-backed version of this app.
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Relative, not '/sw.js' - this must resolve against the current
  // page's URL so it still works at a subpath (e.g. GitHub Pages'
  // /Shift-pay-app/), not just a domain root.
  const reg = await navigator.serviceWorker.register('sw.js');
  reg.update().catch(() => {});

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (window.__swReloaded) return;
      window.__swReloaded = true;
      window.location.reload();
    });
  }
}

registerServiceWorker();
loadToday();

if (location.hash === '#settings') showView('settings');
