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
samples/     A generated workbook, the standalone HTML build, and the single-file
             discovery model used in the call itself.
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
manualHours           = resources × shiftHours × workDays
manualCost            = resources × salary
addressableHours      = manualHours × addressableShare
addressableManualCost = manualCost × addressableShare
hoursPerDock          = dockHours × dockDays
productiveHours       = hoursPerDock × utilisation × subFactor
docks                 = roundUp( addressableHours / productiveHours )
operators             = roundUp( docks / docksPerOperator )
autoCost              = docks × dockCost + operators × opCost
saving                = addressableManualCost − autoCost
costRatio             = autoCost / addressableManualCost
totalProgrammeCost    = autoCost + nonAddressableManualCost
implCost              = implBase + docks × implPerDock
returnPct             = saving / autoCost
paybackMonths         = implCost / (saving / 12)
```

### Why the headline figures are not spectacular

An earlier draft produced a payback of half a month and a 340% return. Those are alarm
flags, not selling points, and three assumptions caused them.

**A dock was treated as productive for all 8,760 hours it can operate.** Weather and
daylight limits take roughly half, the battery charge duty cycle takes half again, and
maintenance and connectivity take a little more. Compounded, a dock is realistically
productive for 20–25% of its operating hours. `utilisation` is now explicit.

**The entire manual programme was treated as displaceable.** Confined space entry,
ultrasonic thickness measurement, tactile inspection, permits and reporting are not
reachable by a drone. `addressableShare` is now explicit, and savings are measured only
against the addressable scope, because the customer keeps paying for the rest.

**Implementation was flat regardless of fleet size**, at $250,000 total, which works out at
under $9,000 per dock for a 28-dock deployment. It now has a programme base plus a per-dock
cost covering site survey, civils, power and network, regulatory approval, commissioning
and training.

With those corrected, a dock displaces roughly one FTE rather than 3.65, returns a little
under twice its annual cost rather than 4.5×, and payback lands between 17 and 20 months
for the major refinery cases.

The original figures remain provable: `UNCALIBRATED_PARAMS` sets utilisation and
addressable share to 1.0 and implementation per dock to 0, collapsing the model to its
original form, and the published acceptance suite runs against it.

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

### What the calibrated model shows

| Site | Cost ratio | Payback | Assessment |
| --- | --- | --- | --- |
| Ørsted, offshore substation | 30.7% | 8.5 mo | Strong case |
| Aramco, Ras Tanura | 57.9% | 17.5 mo | Viable |
| Shell, Pernis Refinery | 58.1% | 19.6 mo | Viable |
| BP, Rotterdam | 59.8% | 20.1 mo | Viable |
| Chevron, Pipeline North | 82.5% | 61.0 mo | Marginal |
| Reliance, Jamnagar | 137% | none | Labour case does not stand alone |

Offshore wins hardest, because sending a technician costs a vessel day and a helicopter
slot. The Indian sites do not clear the bar on labour displacement alone: autonomous
inspection costs roughly $33 per displaced labour hour, and local inspection labour costs
less than that. The model says so rather than manufacturing a saving.

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

**Utilisation and addressable share are the key uncertainties.** They are the only two
assumptions that are neither a commercial figure we can quote nor an answer the customer
gave us, which is why the sensitivity section sweeps both as a grid. At the default
settings, utilisation can fall from 25% to 22.8% before payback passes 24 months, about
9% of headroom, which is thin enough that a site survey should precede any commitment.

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
