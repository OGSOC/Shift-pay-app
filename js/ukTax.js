/**
 * UK Income Tax + employee National Insurance estimate, England/Wales/NI
 * rates, tax year 2026/27 (6 April 2026 - 5 April 2027) - sourced from
 * gov.uk's "Rates and thresholds for employers 2026 to 2027"
 * (https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027),
 * checked October 2026.
 *
 * These figures are fixed by the Budget each year and can't be computed
 * from a formula (unlike the bank holidays or shift rota elsewhere in
 * this app) - update TAX_YEAR below by hand once a new tax year's rates
 * are confirmed. Whatever's here is applied uniformly to every month the
 * pay calculator shows, including one that actually falls in a different
 * tax year if you navigate back or forward far enough - see the note
 * surfaced in the UI and the README.
 *
 * This is a simplified, single-period PAYE-style estimate: each period's
 * gross pay is treated as if it were exactly one month's pay, using 1/12
 * of the annual Income Tax bands and the published monthly NI thresholds
 * - not a cumulative calculation across the tax year (which is how PAYE
 * actually reconciles pay that varies month to month), and it does not
 * account for pension contributions, student loan repayments, or any
 * other deduction. Estimate only.
 */

const TAX_YEAR = '2026/27';

const ANNUAL_BASIC_RATE_BAND = 37700; // width of the 20% band, above the personal allowance
const ANNUAL_ADDITIONAL_RATE_THRESHOLD = 125140; // 45% applies above this - fixed, not personal-allowance-relative

const BASIC_RATE = 0.20;
const HIGHER_RATE = 0.40;
const ADDITIONAL_RATE = 0.45;

// Class 1 employee NI - fixed government thresholds, independent of tax
// code (NI has no concept of a personal tax code or personal allowance).
const NI_MONTHLY_PRIMARY_THRESHOLD = 1048;
const NI_MONTHLY_UPPER_EARNINGS_LIMIT = 4189;
const NI_MAIN_RATE = 0.08;
const NI_UPPER_RATE = 0.02;

/**
 * Annual tax-free personal allowance for a standard 'L'-suffix tax code:
 * the number before the letter, x10 - this is HMRC's own definition (e.g.
 * 1265L -> &pound;12,650/year tax-free), not necessarily the same as the
 * standard &pound;12,570 personal allowance, since a non-standard code
 * like this usually reflects the individual's own adjustments.
 *
 * Only standard numeric + 'L' codes are supported - not BR, D0, D1, NT,
 * 0T, M, N, or K-prefixed/negative-allowance codes, which work
 * differently (a flat rate, no allowance, or an allowance reduction
 * rather than an addition) and aren't handled here. Returns null for
 * anything else, including a blank/missing code.
 */
function personalAllowanceFor(taxCode) {
  if (!taxCode) return null;
  const match = /^(\d{1,4})L$/i.exec(taxCode.trim());
  if (!match) return null;
  return Number(match[1]) * 10;
}

/** Estimated Income Tax for one month's gross pay (see module notes on the monthly simplification). */
function estimateMonthlyIncomeTax(monthlyGross, annualPersonalAllowance) {
  const pa = annualPersonalAllowance / 12;
  const basicBandEnd = pa + ANNUAL_BASIC_RATE_BAND / 12;
  const additionalThreshold = ANNUAL_ADDITIONAL_RATE_THRESHOLD / 12;

  let remaining = monthlyGross;
  let tax = 0;
  if (remaining > additionalThreshold) {
    tax += (remaining - additionalThreshold) * ADDITIONAL_RATE;
    remaining = additionalThreshold;
  }
  if (remaining > basicBandEnd) {
    tax += (remaining - basicBandEnd) * HIGHER_RATE;
    remaining = basicBandEnd;
  }
  if (remaining > pa) {
    tax += (remaining - pa) * BASIC_RATE;
  }
  return tax;
}

/** Estimated Class 1 employee National Insurance for one month's gross pay. */
function estimateMonthlyNationalInsurance(monthlyGross) {
  let remaining = monthlyGross;
  let ni = 0;
  if (remaining > NI_MONTHLY_UPPER_EARNINGS_LIMIT) {
    ni += (remaining - NI_MONTHLY_UPPER_EARNINGS_LIMIT) * NI_UPPER_RATE;
    remaining = NI_MONTHLY_UPPER_EARNINGS_LIMIT;
  }
  if (remaining > NI_MONTHLY_PRIMARY_THRESHOLD) {
    ni += (remaining - NI_MONTHLY_PRIMARY_THRESHOLD) * NI_MAIN_RATE;
  }
  return ni;
}

/**
 * Estimated net pay for one period's gross pay, given a UK tax code.
 * `supported: false` (with no other fields) means the code is blank or
 * isn't a standard 'L'-suffix code this module can interpret - the
 * caller should show gross-only in that case rather than a wrong net
 * figure.
 */
function estimateNetPay(grossPay, taxCode) {
  const annualPersonalAllowance = personalAllowanceFor(taxCode);
  if (annualPersonalAllowance == null) return { supported: false };

  const incomeTax = estimateMonthlyIncomeTax(grossPay, annualPersonalAllowance);
  const nationalInsurance = estimateMonthlyNationalInsurance(grossPay);

  return {
    supported: true,
    taxYear: TAX_YEAR,
    annualPersonalAllowance,
    incomeTax,
    nationalInsurance,
    netPay: grossPay - incomeTax - nationalInsurance,
  };
}
