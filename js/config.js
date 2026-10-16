// Shift rota configuration - edit these directly if your rota/office
// dates ever change. There's no settings-UI for these since they're set
// once and essentially never touched, same as the old .env values they
// replace.
const config = {
  // Fixed Mon-Fri office hours before the shift rota begins.
  preShiftStart: '2026-09-01',
  preShiftEnd: '2026-09-12',
  preShiftStartHour: 9,
  preShiftEndHour: 17,

  // The GSOC 4-on/4-off rota. shiftBlockAnchor is the START DATE of a
  // confirmed work block (a date you know for certain was day 1 of an
  // on-block), and shiftBlockAnchorType is whether THAT block was day or
  // night shift. Day/night then alternates every 8-day cycle (4 on/4 off)
  // from that anchor, in both directions. shiftStartDate is the first day
  // you actually start working the rota (may be partway through the
  // anchor's block, e.g. if the block starts before your start date).
  shiftStartDate: '2026-09-13',
  shiftBlockAnchor: '2026-09-11',
  shiftBlockAnchorType: 'night',

  // Seed values for the pay calculator - only used the very first time
  // the app runs on a given device (see localStore.js); after that, the
  // real values live in localStorage and are edited from the app itself
  // (Today tab for hourly rate, Settings tab for tax code).
  defaultHourlyRate: 19.95,
  defaultTaxCode: '1265L',
};
