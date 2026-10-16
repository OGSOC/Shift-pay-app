# Shift & Pay

A phone-installable work calendar and pay calculator:

- **Shift calendar** — a month-grid view of a GSOC 4-on/4-off rota
  (day/night alternating each 4-day block), with fixed 9–5 office hours for
  a run-up period before the rota starts. Any day can be overridden — add
  an overtime shift (day or night), block a day off as annual leave, or log
  actual hours worked that differ from what was scheduled — right from the
  app.
- **Pay calculator** — gross and estimated net pay (Income Tax + National
  Insurance) for any calendar month, past or future, with UK bank holidays
  highlighted and automatically paid at double rate when worked.

It's a **fully static PWA** — there is no server, no backend, no account,
and no internet connection needed once it's loaded. Every calculation
(the shift rota, UK bank holidays, pay, tax/NI) runs as plain JavaScript
directly in your browser, and everything you enter is saved in **this
browser's local storage, on this device** — not on anyone else's server,
not synced anywhere, and not lost to a hosting platform rebuilding its
filesystem on a deploy (which is what kept wiping overtime shifts in an
earlier, server-backed version of this app).

## How it's put together

```
shift-pay-app/
  index.html, css/, icons/, manifest.webmanifest   The app shell
  js/                                               All the logic, plain scripts, no build step
  sw.js                                             Service worker: offline support + auto-update
  capacitor.config.json, android/                  The native Android wrapper (see below)
  scripts/build-www.sh                             Copies the shell above into www/ for Capacitor
  .github/workflows/android-build.yml              Builds the Android .apk on every push
```

`js/` is loaded as a sequence of plain `<script>` tags (see `index.html`)
rather than bundled modules - small enough that a build step would add
more complexity than it removes. Load order matters; each file's own
comment says what it depends on.

| File | Replaces (from the old server-backed version) | What it does |
|---|---|---|
| `dateutils.js` | - | Shared `dateKey()` date-formatting + a couple of constants every other file uses |
| `config.js` | `.env` | Rota dates + seed defaults for hourly rate/tax code |
| `bankHolidays.js` | `server/src/bankHolidays.js` | Computes UK bank holidays from fixed rules |
| `ukTax.js` | `server/src/ukTax.js` | Income Tax + NI estimate |
| `localStore.js` | `server/src/store.js` + the API routes' validation | Reads/writes `localStorage` instead of a server-side `db.json` |
| `shiftSchedule.js` | `server/src/shiftSchedule.js` | The rota/override computation |
| `payCalc.js` | the pay routes in `server/src/routes/api.js` | Gross/net pay for a given month |
| `app.js` | `web/js/app.js` | UI - now calls the functions above directly instead of `fetch()`-ing an API |

## Running it

There's nothing to install and nothing to configure to just try it:

```bash
# from this directory
python3 -m http.server 8080
# -> http://localhost:8080
```

Any static file server works equally well (`npx serve`, nginx, etc) -
this really is just HTML/CSS/JS with no server-side logic at all.

### Hosting it so your phone can reach it: GitHub Pages

Since the whole app is static files with no backend, **GitHub Pages**
(free, part of this repo) is the natural fit — push to this repo and your
phone reaches it over HTTPS, with no hosting account, no always-on
machine, and none of the "my data got wiped on deploy" problems a
server-based app can have on a free hosting tier (there's no server to
redeploy, and nothing is ever written anywhere but your own device).

One-time setup:

1. On GitHub: **Settings → Pages → Build and deployment → Source**: "Deploy
   from a branch" → branch `main`, folder `/ (root)` → **Save**.
2. GitHub gives you a URL like `https://ogsoc.github.io/Shift-pay-app/`
   (shown on that same Pages settings page once it's deployed, usually
   within a minute or two of saving).
3. Open that URL on your phone.

Every future `git push` to `main` updates the live site automatically -
no separate deploy step.

### Installing as a native Android app (recommended)

The app is also wrapped as a genuine installable Android app with
[Capacitor](https://capacitorjs.com/) - same HTML/CSS/JS, running in a
native WebView shell instead of a browser tab, with a proper app icon,
a branded splash screen, a status bar matching the app's dark theme, and
the hardware back button behaving the way every other Android app's
does (closes the day editor, then backs out of Settings to Today,
only exiting the app from there).

Every push to `main` builds a debug `.apk` via GitHub Actions
(`.github/workflows/android-build.yml`) - no Android SDK needed on your
own machine:

1. On GitHub: **Actions → Build Android APK** → pick the latest
   (green) run.
2. Scroll to **Artifacts** → download `shift-pay-debug-apk` (a zip
   containing `app-debug.apk`).
3. Copy the `.apk` to your phone and open it. Android will warn about
   installing from an unknown source the first time - this is expected
   for an app installed outside the Play Store; allow it for this file.

To build it yourself instead of waiting on CI (needs Node.js + a JDK +
the Android SDK locally):

```bash
npm install
npm run sync        # copies the site into www/ and syncs the Android project
cd android
./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Data still lives entirely in `localStorage`, same as the PWA - Capacitor's
WebView gives the app its own storage just like a browser tab would, it's
just no longer sharing it with Chrome. It survives app restarts and
phone reboots; only uninstalling the app clears it (see the fine print
below).

### Installing as a web app (alternative, no APK needed)

Skip this if you've installed the native app above - both read/write
the same kind of local storage, just not the same storage (a browser tab
and the native app's WebView don't share one, so pick one and stick
with it, or copy your data across using the backup trick in the fine
print below).

**Android (Chrome)**: open the GitHub Pages URL → menu → "Add to Home
screen" (or Chrome may offer this automatically after a visit or two).

**iOS (Safari)**: open the URL → Share icon → "Add to Home Screen".

Either way you get a full-screen icon with no browser chrome. Because of
the service worker (`sw.js`), the app keeps working **without a network
connection** too, once it's been opened at least once — useful if you're
somewhere with no signal and need to check today's shift or log an
overtime hour.

### Picking up updates

`sw.js` forces an update check on every page load (rather than relying on
the browser's own, much less frequent default check) and auto-reloads
itself once if a newer version takes over a page that was already open -
so a change pushed to GitHub reaches your phone within, at most, two app
opens: the first lets the new version finish installing in the
background, the second runs it. This is the same proven pattern that
fixed repeated stale-cache bugs in the earlier, server-backed version of
this app, carried over here so it can't recur.

## Your data lives on your phone - the fine print

Everything (overrides, hours corrections, hourly rate, tax code) is
stored in this browser's `localStorage`, under the key `shiftPayApp.v1`.
That means:

- **Nothing can wipe it except you, on this device** - no deploy, no
  hosting platform, no redeploy. That was the entire point of moving to
  this architecture.
- **It doesn't sync between devices or browsers.** Install it on a second
  phone, or switch browsers on the same phone, and you start from the
  seed defaults in `config.js` - the two copies are independent.
- **Clearing this browser's site data, or uninstalling the app, deletes
  it** - there's no backup copy anywhere else. If you want one, open your
  browser's DevTools console on the app and run
  `localStorage.getItem('shiftPayApp.v1')` to copy out the raw JSON
  (paste it back in with `localStorage.setItem('shiftPayApp.v1', '<that JSON>')`
  to restore it, including on a different device/browser).

## Overtime and annual leave

Any date can be manually overridden, taking priority over everything else
(pre-shift office hours and the rota alike):

- **From the Today tab**: tap any day on the month-grid calendar to open a
  quick-edit sheet — add overtime (day or night, same 07:00–19:00 /
  19:00–07:00 hours as a normal shift), block it off as leave, or reset it
  back to the computed schedule.
- **From Settings**: the "Overtime & leave" section applies the same actions
  across a date range (e.g. blocking off a whole week of annual leave at
  once), and lists every currently active override with a one-tap "Clear".

Overrides take effect immediately and don't change `SHIFT_BLOCK_ANCHOR`
or the rest of the rota in `config.js` — clearing one just reverts that
single date to what the schedule would otherwise say.

## Hours worked and the pay calculator

The same day-edit sheet (tap a day on the Today tab's calendar) also shows
that day's hours — the shift/office status line first, then a "Hours
worked" section underneath, independent of the leave/overtime override
above it. A day's hours can be overridden two ways, without touching its
shift type:

- **Exact times**: set a real start/end for that date (e.g. a shift that
  actually ran 19:00–20:00 later than scheduled).
- **Total hours**: skip the clock entirely and just enter a number (e.g.
  `10`) for days where only the total matters.

With no override, hours are computed from the day's normal schedule: the
gap between its shift start/end (12h for a day/night shift, 8h for a
pre-shift office day with the defaults above), or 0h for an off day. A day
marked as **leave always counts as 0 hours for pay purposes**, even if an
hours override happens to be stored underneath it — clearing the leave
override brings that stored override back into effect rather than losing
it, so it's safe to toggle leave on and off without re-entering hours.

The **Pay period** section (also on the Today tab, below the calendar) has
one shared settings card, a month navigator (←/→ arrows), and one or two
result cards below it depending on which month you're looking at.

The pay period itself is **not** something you set — it's fixed to match
the actual pay cycle: a full **calendar month** (the 1st through the last
day of that month), paid on the **11th of the following month** — moved to
the **preceding Friday** if that 11th falls on a Saturday or Sunday. This is
computed automatically from whatever month you're viewing — there's no
payday to enter, remember, or get out of sync.

- Set an **hourly rate** (£) — seeded from `config.defaultHourlyRate` the
  first time the app runs on a device, then edited and persisted here
  from then on.

The page always opens on the **current month** — the arrows just move the
view forward or backward from there; reloading always snaps back to the
current month. Both result cards are **pre-tax estimates only** — actual
pay may differ due to rounding, your employer's own calculations,
backdated changes, or anything else outside what this app can see.

What you see depends on the viewed month's status, since "earned so far"
and "forecast" only both make sense for a month that's partway done:

- **Viewing the current month** (the default): both cards — **Earned so
  far** (green accent, "live" badge), a running total capped at *today*
  (only days that have actually happened count, even if later days in the
  month are already scheduled), and **Full period forecast** (blue accent,
  "projection" badge), the *whole* month's worth of hours including shifts
  that haven't happened yet, assuming they run exactly as currently
  scheduled.
- **Viewing a past month**: one card, **Total earned** ("final" badge) —
  every day in the month has already happened, so this is a settled total.
- **Viewing a future month**: one card, **Forecast** ("projection" badge) —
  nothing in it has happened yet, projected entirely from the rota.

Every card also shows the **shift count** and the **payment date** for
that period. For a past month, the total uses whatever's actually recorded
for each day — the same per-date hours override described above — falling
back to the scheduled rota for any day that wasn't corrected; there's no
separate "actuals" store to maintain. The 4-on-4-off rota
(`js/shiftSchedule.js`) is a pure formula against a fixed anchor date with
no upper bound, so navigating arbitrarily far into the future needs no
extra data or configuration.

## Net pay estimate (Income Tax & National Insurance)

Set your **UK tax code** on the Settings tab (defaults to
`config.defaultTaxCode` the first time the app runs) and both pay cards
show an estimated **net pay** alongside gross, e.g. "£1,675.80 gross ·
£1,501.25 est. net". Clearing the field back to blank goes back to
gross-only.

Only a standard numeric + `L` code is understood (e.g. `1265L` — a flat
rate code like `BR`/`D0`/`D1`, `NT`, `0T`, or a `K`-prefixed code isn't,
since those work differently). An unrecognised or blank code shows
gross-only with a note, never a wrong net figure. The personal allowance
is the number before the `L`, ×10 (HMRC's own definition) — so a
non-standard code like `1265L` correctly gives a different allowance
(£12,650/year) than the standard `1257L` (£12,570/year); that's expected,
not a bug, since a non-standard code usually reflects your own specific
adjustments.

The estimate is a **simplified, single-period calculation**: each pay
card's gross is treated as if it were exactly one month's pay, using 1/12
of the annual Income Tax bands and the published monthly National
Insurance thresholds (the standard simplified monthly PAYE approach) —
not a cumulative calculation across the tax year the way PAYE actually
reconciles pay that varies month to month, and it does **not** account
for pension contributions, student loan repayments, or any other
deduction. It also applies the **current tax year's rates to every month
shown**, including one in a different tax year if you navigate far enough
back or forward — there's no historical/future rate table.

The rates themselves (`js/ukTax.js`) are sourced from gov.uk for the
2026/27 tax year (6 April 2026 – 5 April 2027) and, unlike the bank
holidays or shift rota, **can't be computed from a formula** — they're
fixed by the Budget each year, so that file needs a manual update (tax
year label, bands, thresholds) once a new tax year's rates are confirmed.

## Bank holidays

England & Wales bank holidays are marked with a small rose dot in the
corner of their calendar cell (hover/tap for the name), and any hours
actually worked on one — computed shift, office day, or overtime, it
doesn't matter which — are paid at **double the hourly rate** in both pay
cards, with a note showing how many hours that applied to. A bank holiday
that isn't worked is still marked, just with no pay effect — leave always
counts as 0 hours regardless.

`js/bankHolidays.js` computes all 8 standard annual bank holidays (New
Year's Day, Good Friday, Easter Monday, the three "Monday" bank holidays
in May/May/August, Christmas Day, Boxing Day) from fixed rules, including
the weekend-substitution logic and the Easter date calculation — no
external data source, so it works correctly for any year without needing
updates. It does **not** know about one-off additional bank holidays
announced separately from the standard calendar (e.g. a coronation or
jubilee) — those aren't derivable from any fixed rule, so they won't be
highlighted or paid at double rate unless the day is added to that file
by hand.

## Notes on the shift schedule logic

`js/shiftSchedule.js` has four layers, checked in order for any given
date:

1. **Manual overrides** (overtime or leave), set from the app — see above.
2. **Pre-shift office days** (`config.preShiftStart`–`preShiftEnd`,
   Mon–Fri only): fixed 09:00–17:00.
3. **Before `config.shiftStartDate`**: no rota data — treated as a day
   off (the rota genuinely hasn't started yet).
4. **The GSOC rota**: a repeating 8-day cycle (4 on, 4 off) anchored at
   `config.shiftBlockAnchor`, matching the confirmed block table.
   Day/night alternates on every on-block, starting from
   `shiftBlockAnchorType` at the anchor and flipping every cycle in both
   directions — so it correctly reproduces the exact table (e.g. blocks
   in Aug 2026 and Mar 2027 come out matching what was confirmed). If
   `shiftStartDate` falls partway through the anchor's block (as it does
   by default — the block starts 11 Sep but you don't start until 13
   Sep), only the days from `shiftStartDate` onward count, and the
   on-day counter (`day 1/4`, `day 2/4`...) is relative to your actual
   first day, not the block's nominal start.

## Extending

- All the rota/pay config lives in `js/config.js` — edit it directly if
  your rota dates, hourly rate, or default tax code ever change; there's
  no settings UI for these since they're set once and rarely touched.
- Only one person's schedule/pay is modelled — there's no multi-user
  support, logins, or per-device sync.
