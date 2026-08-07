# Autonomous Inspection ROI Engine

A labour-displacement ROI model for autonomous drone inspection (drone-in-a-box), built for
live use in enterprise discovery calls and for batch scoring of many customer sites.

Two delivery modes share **one** calculation engine, and a parity test proves they cannot
drift apart.

---

## What it does

Six discovery questions, asked out loud, drive the entire model:

| Question | Field |
| --- | --- |
| How much area do you survey today? | `area` |
| How many people are deployed on that inspection work? | `resources` |
| What does one of those people cost you, fully loaded, per year? | `salary` |
| What area do you need to cover once this scales? | `targetArea` |
| How many hours is a shift? | `shiftHours` |
| How many days a year does the crew work? | `workDays` |

Everything else is supplied by us, shown separately, and clearly labelled as placeholder.

---

## Layout

```
core/        Pure TypeScript calculation engine. No DOM, no file IO, no framework,
             no dependencies. The single source of truth for every number.
web/         React + TypeScript + Vite + Tailwind. Static, no backend, no auth.
batch/       Node CLI: reads a workbook, calls core per row, writes Drone_ROI_Output.xlsx.
workbook/    Shared workbook builder. Called by both the CLI and the browser.
fixtures/    The mock portfolio, built to exercise the awkward cases.
tests/       Unit tests, purity tests, the parity test, workbook integrity.
samples/     A generated workbook and the standalone HTML build.
```

`core/` importing nothing outside itself is asserted by a test, not left to convention.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run batch
```

```bash
npm run batch -- --in path/to/input.xlsx --out Drone_ROI_Output.xlsx
```

```bash
npm run build:single
```

`build:single` produces `dist-single/index.html`, one self-contained file with inline JS
and CSS, no external requests, openable offline and emailable as an attachment.

---

## The model

```
manualHours   = resources × shiftHours × workDays
manualCost    = resources × salary
hourlyRate    = salary / (shiftHours × workDays)
hoursPerDock  = dockHours × dockDays
docks         = roundUp( manualHours / (hoursPerDock × subFactor) )
operators     = roundUp( docks / docksPerOperator )
autoCost      = docks × dockCost + operators × opCost
saving        = manualCost − autoCost
costRatio     = autoCost / manualCost
returnPct     = saving / autoCost
paybackMonths = implCost / (saving / 12)
hoursMultiple = hoursPerDock / (shiftHours × workDays)
```

The target-area scenario scales resources linearly by `targetArea / area`, recomputes every
line, and substitutes the at-scale operator ratio. Nothing is averaged, smoothed or
interpolated between the two scenarios, the contrast between linear manual cost and
sub-linear autonomous cost is the entire point of the second scenario.

### Rounding

**Anything we buy or hire rounds up. Anything we extrapolate about the customer stays
continuous.**

Docks are a purchase and operators are a hire, so both round up, independently, and the
operator ratio is applied to the whole dock count rather than a fractional one.

Scaled resources at the target area are *not* rounded. They are a linear extrapolation of
the customer's own staffing that nobody has committed to. Rounding 168.75 up to 169 would
also inflate manual cost, which flatters the seller, and would turn manual cost into a
step function that obscures the very contrast the target scenario exists to show.

### Recommendation rule

Evaluated in order, on the current-area figures:

| # | Condition | Assessment |
| --- | --- | --- |
| 1 | `costRatio ≤ 0.35` **and** `payback ≤ 12` | Strong case, proceed to scoped study |
| 2 | `costRatio ≤ 0.60` **and** `payback ≤ 24` | Viable, validate assumptions on site |
| 3 | `costRatio ≥ 1.00` | Labour case does not stand alone at these inputs |
| 4 | otherwise | Marginal on labour alone, requires additional value pools to justify |

Both conditions are required in tiers 1 and 2, not either. Invalid rows get no
recommendation at all. Where current and target fall into different tiers, the Status column
says so rather than silently preferring one.

These are rule-derived assessments of what the model shows at the inputs given. They are not
guarantees, forecasts or predictions.

---

## Honesty

**This model prices labour displacement only.** It explicitly excludes avoided scaffolding
and rope access, avoided shutdown windows, compliance penalty exposure, and unplanned
downtime. At industrial scale each of these is typically larger than the labour line, so a
business case built on this alone understates the value and should be read as a floor.

**The autonomous-side defaults are placeholders.** None is derived from commercial data,
none is an industry benchmark. They exist so the model runs before real figures are
available, and must be replaced before customer use.

**The substitution factor is the key uncertainty.** The default of 1.0 is deliberately
conservative: a docked drone does not spend time mobilising to the asset, so the true figure
is likely higher. It moves the dock count more than any other parameter.

**No industry benchmark figure appears anywhere** in the interface, the workbook or the code.
If a number is not derived from the model or supplied by the user, it does not appear.

**Blank input produces blank output.** A missing required answer renders "model incomplete",
never a zero and never a guess.

**Area does not price the model.** It enters only as the ratio `targetArea / area` and as the
denominator of the cost-per-unit-area display lines. If a customer engineer asks where the
square footage went, that is the honest answer.

---

## Testing

166 tests across four suites.

- **`core.spec.ts`**, every formula, every acceptance figure, and every edge case
  (zero, negative, empty, non-numeric, NaN, Infinity). Includes an exhaustive sweep
  asserting that no valid input combination produces a non-finite output.
- **`purity.spec.ts`**, structural guarantees: nothing in `core/` imports outside itself,
  `calc.ts` contains no `Math.ceil`/`Math.round`/`toFixed`, and `round.ts` is the only file
  containing `Math.ceil`.
- **`parity.spec.ts`**, twenty fixture rows through the web path and the CLI path,
  asserted equal to the cent and to the whole dock. The CLI path is reconstructed from
  primitives rather than reusing the web helper, so the two are not the same code called
  twice.
- **`workbook.spec.ts`**, reopens the generated workbook and asserts every sheet exists,
  the charts are native chart XML bound to live cell ranges (not images), the ranges span
  every data row, no cell carries an error value, and two builds are byte-identical.

### Notes on the arithmetic

Two acceptance figures sit exactly on a rounding boundary and neither is representable in
binary. `8760/2400` stores as `3.6499999999999999112`, so the idiomatic `.toFixed(1)`
renders it `3.6` where the model requires `3.7`. Rounding therefore goes through an explicit
epsilon-aware half-up helper, and both boundaries are asserted directly.

The rule that the operator ratio must never be applied to a fractional dock count is
provably inert for integer ratios, `ceil(ceil(x)/r) ≡ ceil(x/r)` whenever `r` is an
integer. It only has teeth at fractional ratios, which are permitted because five and a half
docks per operator is a real staffing plan. Both the proof and the fractional case are
encoded as tests.

---

## Excel output

`Drone_ROI_Output.xlsx` contains: Executive Summary, Detailed Calculations, Audit Trail,
Sensitivity Analysis, Charts, Exceptions (omitted when empty), README, and the original
input worksheet preserved unmodified.

Charts are **native, editable Excel charts** bound to cell ranges, not images. Editing a
figure on the Executive Summary moves the chart. Ranges are computed from the actual row
count at build time, so adding a site cannot silently drop it from every chart.

Written with [`@office-kit/xlsx`](https://github.com/office-kit/xlsx), which emits genuine
`c:chart` parts. This was chosen after confirming that the more established JavaScript
libraries (ExcelJS, SheetJS CE, xlsx-populate) cannot emit chart XML at all.

---

## Known limitation

The generated workbook has not been opened in Excel to confirm it triggers no repair prompt, that check requires macOS automation permission which was unavailable in the build
environment. The package structure, content types, relationship wiring and chart bindings
are all asserted programmatically, and the file round-trips through the library's own reader
with charts intact. But the repair-prompt check itself remains unverified rather than passed.
