import type { ModelResult, Params, ScenarioMetrics } from '../../core/index.js';
import {
  INCOMPLETE,
  formatCount,
  formatHours,
  formatCurrency,
  formatMonths,
  formatMultiple,
  formatPercent,
  formatResources,
  formatReturn,
} from '../../core/index.js';
import type { ScoredSite, PortfolioTotals } from './scoring.js';

/* ------------------------------------------------------------------ shared */

/**
 * A section panel.
 *
 * `note` is a short caption shown inline. `detail` is the longer honesty text,
 * which sits behind a disclosure so the screen stays scannable in a live call
 * without the caveats being deleted: a salesperson can open it the moment a
 * customer engineer asks.
 */
export function Panel({
  eyebrow,
  title,
  children,
  note,
  detail,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  note?: string;
  detail?: string;
}) {
  return (
    <section className="print-section surface">
      <header className="border-b border-line px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          {eyebrow && <span className="eyebrow text-accent">{eyebrow}</span>}
          <h2 className="text-[1rem] font-bold">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {note && <p className="text-[0.75rem] text-muted">{note}</p>}
          {detail && (
            <details className="relative">
              <summary className="btn btn-sm cursor-pointer list-none text-[0.6875rem] px-2 py-1">
                Why
              </summary>
              <div className="absolute right-0 top-full mt-2 z-10 w-[34ch] surface p-3 text-[0.75rem] leading-relaxed">
                {detail}
              </div>
            </details>
          )}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'ink',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ink' | 'good' | 'warn' | 'accent';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-good'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-ink';
  return (
    <div className="surface px-4 py-3 flex flex-col gap-1.5">
      <div className="eyebrow text-muted">{label}</div>
      <div className={`text-[1.375rem] leading-none font-bold tnum ${toneClass}`}>{value}</div>
      {sub && <div className="text-[0.6875rem] text-muted leading-snug">{sub}</div>}
    </div>
  );
}

export function Incomplete({ result }: { result: ModelResult }) {
  return (
    <div className="surface bg-warn-soft px-5 py-4 flex flex-col gap-2">
      <div className="eyebrow text-warn">Model incomplete</div>
      <ul className="text-[0.875rem] flex flex-col gap-1">
        {result.issues.map((issue, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-warn select-none">
              &bull;
            </span>
            <span>{issue.reason}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.6875rem] text-muted">Nothing is substituted for a missing answer.</p>
    </div>
  );
}

function Warnings({ result }: { result: ModelResult }) {
  if (result.warnings.length === 0) return null;
  return (
    <div className="surface bg-warn-soft px-4 py-3 flex flex-col gap-1 mb-4">
      <div className="eyebrow text-warn">Check before use</div>
      {result.warnings.map((w, i) => (
        <p key={i} className="text-[0.8125rem]">
          {w.message}
        </p>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- executive summary */

export function ExecutiveSummary({ result, params }: { result: ModelResult; params: Params }) {
  if (result.status !== 'ok') {
    return (
      <Panel eyebrow="01" title="Executive summary">
        <Incomplete result={result} />
      </Panel>
    );
  }

  const c = result.current;
  const tierNote = result.tierImprovesAtTarget
    ? 'Tier improves at the target area. The case strengthens as the site scales.'
    : result.tierWeakensAtTarget
      ? 'Tier weakens at the target area. The case is stronger today than at scale.'
      : null;

  return (
    <Panel
      eyebrow="01"
      title="Executive summary"
      detail="The cost ratio compares autonomous cost against the manual cost it can actually displace, not against the whole programme. Confined space entry, ultrasonic readings, permits and reporting stay on the payroll, so total programme cost falls by less than the headline."
    >
      <Warnings result={result} />

      <div className="flex flex-wrap items-end gap-x-10 gap-y-5 mb-5">
        <div>
          <div className="eyebrow eyebrow-mark text-accent mb-2">Cost ratio, addressable scope</div>
          <div className="display text-ink text-[3.5rem] sm:text-[4rem]">{formatPercent(c.costRatio)}</div>
        </div>

        <div className="grid grid-cols-3 w-full sm:w-auto border-t sm:border-t-0 border-line pt-4 sm:pt-0">
          <MiniStat label="At target" value={formatPercent(result.target.costRatio)} />
          <MiniStat label="Addressable" value={formatPercent(c.addressableShare, 0)} />
          <MiniStat label="Programme" value={formatPercent(c.programmeCostRatio)} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <Stat
          label="Annual saving"
          value={formatCurrency(c.saving, params.currency)}
          tone={c.saving >= 0 ? 'good' : 'warn'}
        />
        <Stat
          label="Return on spend"
          value={formatReturn(c.returnPct)}
          sub="Excludes implementation"
          tone={(c.returnPct ?? 0) >= 0 ? 'good' : 'warn'}
        />
        <Stat
          label="Payback"
          value={c.paybackMonths === null ? 'None' : `${formatMonths(c.paybackMonths)} mo`}
          sub={formatCurrency(c.implCost, params.currency) + ' implementation'}
          tone={c.paybackMonths === null ? 'warn' : 'ink'}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat
          label="Productive hrs per dock"
          value={formatHours(c.productiveHoursPerDock)}
          sub={`${formatPercent(c.utilisationUsed, 0)} of ${formatHours(c.hoursPerDock)}`}
          tone="accent"
        />
        <Stat label="Docks" value={formatCount(c.docks)} />
        <Stat label="Operators" value={formatCount(c.operators)} sub={`${c.ratioUsed}:1`} />
      </div>

      <div className="mt-5 pt-4 border-t border-line flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="eyebrow text-accent">Assessment</div>
          <p className="text-[0.9375rem] font-bold">{result.recommendation}</p>
          {tierNote && <p className="text-[0.75rem] text-warn">{tierNote}</p>}
        </div>
        <p className="text-[0.625rem] text-muted max-w-[26ch] text-right">
          Rule-derived at these inputs. Not a forecast.
        </p>
      </div>
    </Panel>
  );
}

/** A compact secondary figure, for context beside the hero without a paragraph. */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 first:pl-0 last:pr-0 border-l border-line first:border-l-0">
      <div className="eyebrow text-muted">{label}</div>
      <div className="text-[1.0625rem] tnum text-ink">{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------- comparison */

export function Comparison({ result, params }: { result: ModelResult; params: Params }) {
  if (result.status !== 'ok') {
    return (
      <Panel eyebrow="02" title="Manual versus autonomous cost">
        <Incomplete result={result} />
      </Panel>
    );
  }

  const pairs = [
    { label: 'Current area', m: result.current },
    { label: 'Target area', m: result.target },
  ];
  const max = Math.max(...pairs.flatMap((p) => [p.m.manualCost, p.m.totalProgrammeCost]));

  const W = 720;
  const H = 300;
  const padL = 8;
  const padB = 74;
  const plotH = H - padB - 34;
  const groupW = (W - padL * 2) / 2;
  const barW = 92;
  const gap = 26;

  const y = (v: number) => plotH - (v / max) * plotH + 34;

  return (
    <Panel
      eyebrow="02"
      title="Manual versus autonomous cost"
      note="Programme cost, before and after"
      detail="The pale block is the work a drone cannot do, which the customer keeps paying either way. Only the solid block is in play."
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px] h-auto"
          role="img"
          aria-label="Manual versus autonomous annual cost at current and target area"
        >
          <line x1={padL} y1={plotH + 34} x2={W - padL} y2={plotH + 34} stroke="var(--color-line)" strokeWidth={1} />
          {pairs.map((pair, i) => {
            const gx = padL + i * groupW;
            const cx = gx + groupW / 2;
            const x1 = cx - barW - gap / 2;
            const x2 = cx + gap / 2;
            // Stacked, because the honest comparison is total programme cost
            // before against total programme cost after. The non-addressable
            // labour does not disappear, and showing only manual-vs-autonomous
            // would imply it does.
            const bars = [
              {
                x: x1,
                total: pair.m.manualCost,
                segments: [
                  { v: pair.m.addressableManualCost, fill: 'var(--color-accent-soft)', stroke: 'var(--color-accent)' },
                  { v: pair.m.nonAddressableManualCost, fill: 'var(--color-line-soft)', stroke: 'var(--color-muted)' },
                ],
                label: 'Manual today',
              },
              {
                x: x2,
                total: pair.m.totalProgrammeCost,
                segments: [
                  { v: pair.m.autoCost, fill: 'var(--color-good-soft)', stroke: 'var(--color-good)' },
                  { v: pair.m.nonAddressableManualCost, fill: 'var(--color-line-soft)', stroke: 'var(--color-muted)' },
                ],
                label: 'With autonomous',
              },
            ];
            return (
              <g key={pair.label}>
                {bars.map((b) => {
                  let cursor = 0;
                  return (
                    <g key={b.label}>
                      {b.segments.map((seg, si) => {
                        const yTop = y(cursor + seg.v);
                        const yBot = y(cursor);
                        cursor += seg.v;
                        return (
                          <rect
                            key={si}
                            x={b.x}
                            y={yTop}
                            width={barW}
                            height={Math.max(0, yBot - yTop)}
                            fill={seg.fill}
                            stroke={seg.stroke}
                            strokeWidth={1}
                          />
                        );
                      })}
                      <text
                        x={b.x + barW / 2}
                        y={y(b.total) - 8}
                        textAnchor="middle"
                        fontSize={12.5}
                        fontWeight={600}
                        fill="var(--color-ink)"
                      >
                        {formatCurrency(b.total, params.currency)}
                      </text>
                      <text
                        x={b.x + barW / 2}
                        y={plotH + 50}
                        textAnchor="middle"
                        fontSize={11}
                        fill="var(--color-muted)"
                      >
                        {b.label}
                      </text>
                    </g>
                  );
                })}
                <text x={cx} y={plotH + 68} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-ink)">
                  {pair.label}
                </text>
                <text x={cx} y={plotH + 84} textAnchor="middle" fontSize={11.5} fill="var(--color-good)">
                  Saving {formatCurrency(pair.m.saving, params.currency)}, programme cost{' '}
                  {formatPercent(pair.m.programmeCostRatio)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[0.8125rem]">
        <div className="border border-line-soft px-4 py-3">
          <div className="eyebrow text-accent mb-1">Addressable scope</div>
          Only {formatPercent(result.current.addressableShare, 0)} of the inspection programme is
          reachable by aerial inspection. The rest is confined space, thickness readings, tactile
          work, permits and reporting, and it stays on the manual line.
        </div>
        <div className="border border-line-soft px-4 py-3">
          <div className="eyebrow text-good mb-1">Autonomous, sub-linear</div>
          Docks go {formatCount(result.current.docks)} → {formatCount(result.target.docks)} and
          operators {formatCount(result.current.operators)} → {formatCount(result.target.operators)},
          so cost scales by only {(result.target.autoCost / result.current.autoCost).toFixed(2)}×.
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------- audit */

export function Audit({ result, params }: { result: ModelResult; params: Params }) {
  if (result.status !== 'ok') {
    return (
      <Panel eyebrow="03" title="Audit trail">
        <Incomplete result={result} />
      </Panel>
    );
  }

  const render = (value: number | null, kind: string): string => {
    if (value === null) return kind === 'months' ? 'No payback at these inputs' : INCOMPLETE;
    switch (kind) {
      case 'currency':
        return formatCurrency(value, params.currency);
      case 'percent':
        return formatPercent(value);
      case 'months':
        return formatMonths(value);
      case 'multiple':
        return formatMultiple(value);
      case 'perArea':
      case 'rate':
        return formatCurrency(value, params.currency, 2);
      case 'count':
        return formatCount(value);
      case 'countExact':
      case 'resources':
        return formatResources(value);
      case 'factor':
        return value.toFixed(4).replace(/\.?0+$/, '');
      default:
        return value.toLocaleString('en-US');
    }
  };

  return (
    <Panel
      eyebrow="03"
      title="Audit trail"
      note="Recomputable on paper"
      detail="Every intermediate line with its formula. A customer engineer can reproduce every figure in this model from this table alone, without access to the code."
    >
      <div className="overflow-x-auto border border-line-soft">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-accent-soft">
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft whitespace-nowrap">
                Line
              </th>
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Formula</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft whitespace-nowrap">
                Current area
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft whitespace-nowrap">
                Target area
              </th>
            </tr>
          </thead>
          <tbody>
            {result.audit.map((l) => (
              <tr key={l.key} className="align-top">
                <td className="px-3 py-1.5 border-b border-line-soft whitespace-nowrap font-medium">
                  {l.label}
                </td>
                <td className="px-3 py-1.5 border-b border-line-soft text-muted">{l.formula}</td>
                <td className="px-3 py-1.5 border-b border-line-soft text-right tnum whitespace-nowrap">
                  {render(l.current, l.kind)}
                </td>
                <td className="px-3 py-1.5 border-b border-line-soft text-right tnum whitespace-nowrap">
                  {render(l.target, l.kind)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-4 border border-line-soft">
        <summary className="px-4 py-2 cursor-pointer text-[0.8125rem] font-medium bg-accent-soft">
          Show the working, with this site's own numbers substituted
        </summary>
        <div className="px-4 py-3 flex flex-col gap-2 text-[0.75rem]">
          {result.audit.map((l) => (
            <div key={l.key} className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-0.5">
              <div className="font-medium">{l.label}</div>
              <div className="text-muted">
                <div>
                  <span className="text-accent">current</span> {l.currentWorking}
                </div>
                <div>
                  <span className="text-accent">target</span> {l.targetWorking}
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  );
}

/* ------------------------------------------------------------- sensitivity */

export function Sensitivity({ result, params }: { result: ModelResult; params: Params }) {
  if (result.status !== 'ok') {
    return (
      <Panel eyebrow="04" title="Sensitivity">
        <Incomplete result={result} />
      </Panel>
    );
  }

  const grid = result.grid;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  // Bands, not a gradient. A reader should be able to say which band a cell is
  // in without consulting a colour scale.
  const band = (m: number | null) => {
    if (m === null) return { cls: 'bg-warn-soft text-warn', label: 'none' };
    if (m <= 12) return { cls: 'bg-good-soft text-good font-semibold', label: m.toFixed(0) };
    if (m <= 24) return { cls: 'bg-good-soft/50 text-ink', label: m.toFixed(0) };
    if (m <= 48) return { cls: 'bg-surface text-muted', label: m.toFixed(0) };
    // Past four years the exact figure is noise: the dock and operator ceilings
    // make it jump around, and no buyer distinguishes 369 months from 608.
    return { cls: 'bg-warn-soft text-warn', label: '48+' };
  };

  return (
    <Panel
      eyebrow="04"
      title="Sensitivity"
      note="Where the case is won or lost"
      detail="Utilisation and addressable share are the only two assumptions that are neither a commercial figure we can quote nor an answer the customer gave us. Everything else is either priced or supplied. Payback does not fall smoothly across this grid: each added dock costs both its annual fee and its share of implementation, so the surface is a sawtooth. A cell that is worse than the one to its left is where the fleet just grew by one."
    >
      <div className="mb-5">
        <h3 className="text-[0.9375rem] font-semibold mb-1">
          Payback in months, across the two assumptions that matter
        </h3>
        <p className="text-[0.8125rem] text-muted mb-3 max-w-[80ch]">
          Every cell is a full recomputation of the model, not an interpolation. Read down for a
          dock that is productive for more or fewer of its operating hours; read across for more or
          less of the inspection programme being reachable by a drone.
        </p>

        <div className="overflow-x-auto border border-line-soft">
          <table className="w-full text-[0.8125rem] border-collapse">
            <thead>
              <tr className="bg-accent-soft">
                <th className="text-left font-semibold px-3 py-2 border-b border-r border-line-soft whitespace-nowrap">
                  Utilisation \ addressable
                </th>
                {grid.addressableShares.map((a) => (
                  <th
                    key={a}
                    className="text-right font-semibold px-3 py-2 border-b border-line-soft whitespace-nowrap"
                  >
                    {pct(a)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.cells.map((row, i) => (
                <tr key={grid.utilisations[i]}>
                  <th
                    scope="row"
                    className="text-left font-medium px-3 py-1.5 border-b border-r border-line-soft whitespace-nowrap bg-accent-soft/40"
                  >
                    {pct(grid.utilisations[i]!)}
                  </th>
                  {row.map((cell) => {
                    const b = band(cell.paybackMonths);
                    return (
                      <td
                        key={cell.addressableShare}
                        className={`px-3 py-1.5 border-b border-line-soft text-right tnum ${b.cls} ${
                          cell.isCurrent ? 'outline outline-2 outline-ink' : ''
                        }`}
                        title={`${cell.docks} docks, ${cell.operators} operators, cost ratio ${(cell.costRatio * 100).toFixed(0)}%`}
                      >
                        {b.label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          Each key is a real cell, rendered through the same band() the table
          uses, so the legend cannot drift from the grid. The previous version
          used plain swatches, and the two middle bands resolved to #1a2422 and
          #242424 with identical borders: indistinguishable at 12px, which made
          the legend unreadable rather than merely subtle.
        */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-[0.75rem]">
          <span className="eyebrow text-muted">Payback, months</span>
          {[
            { sample: 8, text: '12 or less' },
            { sample: 18, text: '13 to 24' },
            { sample: 36, text: '25 to 48' },
            { sample: null, text: 'over 48, or never' },
          ].map((k) => {
            const b = band(k.sample);
            return (
              <span key={k.text} className="flex items-center gap-2">
                <span
                  className={`inline-block min-w-[2.5rem] text-center px-1.5 py-0.5 tnum text-[0.6875rem] border border-line-soft ${b.cls}`}
                >
                  {b.label}
                </span>
                {k.text}
              </span>
            );
          })}
          <span className="flex items-center gap-2 text-muted">
            <span className="inline-block min-w-[2.5rem] text-center px-1.5 py-0.5 text-[0.6875rem] outline outline-2 outline-ink border border-line-soft">
              &nbsp;
            </span>
            your inputs
          </span>
        </div>
      </div>

      <div className="border border-accent bg-accent-soft/40 px-4 py-3 mb-5">
        <div className="eyebrow text-accent mb-1">How wrong can we be</div>
        {grid.breakEvenUtilisation === null ? (
          <p className="text-[0.875rem] max-w-[80ch]">
            At {pct(result.current.addressableShare)} addressable, no utilisation up to 100% pays
            back inside {grid.horizonMonths} months. The labour line does not carry this site on its
            own, and the case has to be made on the value pools this model excludes.
          </p>
        ) : (
          (() => {
            const be = grid.breakEvenUtilisation;
            const now = result.current.utilisationUsed;
            const headroom = now - be;
            const relative = headroom / now;
            return (
              <p className="text-[0.875rem] max-w-[80ch]">
                Holding addressable share at {pct(result.current.addressableShare)}, utilisation can
                fall from {pct(now)} to{' '}
                <span className="font-semibold">{(be * 100).toFixed(1)}%</span> before payback passes{' '}
                {grid.horizonMonths} months. That is{' '}
                <span className="font-semibold">{(relative * 100).toFixed(0)}%</span> of headroom on
                the single most uncertain number in the model.{' '}
                {relative < 0.1
                  ? 'That is thin. A site survey should precede any commitment.'
                  : 'Confirm it with a site survey before committing to the figure.'}
              </p>
            );
          })()
        )}
      </div>

      <h3 className="text-[0.9375rem] font-semibold mb-1">Docks per operator</h3>
      <p className="text-[0.8125rem] text-muted mb-3 max-w-[80ch]">
        Only the operator term moves. The dock count is set by addressable hours and productive hours
        per dock, neither of which this ratio touches.
      </p>
      <div className="overflow-x-auto border border-line-soft">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-accent-soft">
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">
                Docks per operator
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft">Docks</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft">Operators</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft">
                Autonomous cost
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft">Cost ratio</th>
            </tr>
          </thead>
          <tbody>
            {result.sensitivity.map((row) => {
              const isCurrent = row.ratio === params.ratioNow;
              return (
                <tr key={row.ratio} className={isCurrent ? 'bg-accent-soft/50' : undefined}>
                  <td className="px-3 py-1.5 border-b border-line-soft font-medium">
                    {row.ratio}:1
                    {isCurrent && <span className="text-accent font-normal"> current</span>}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">{row.docks}</td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">
                    {row.operators}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">
                    {formatCurrency(row.autoCost, params.currency)}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">
                    {formatPercent(row.costRatio)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[0.75rem] text-muted mt-3 max-w-[80ch]">
        Reported for the current area. Operators round up from the whole dock count at every ratio,
        so the cost steps rather than sliding.
      </p>
    </Panel>
  );
}

/* --------------------------------------------------------------- portfolio */

export function Portfolio({
  scored,
  totals,
  selected,
  onSelect,
  currency,
}: {
  scored: ScoredSite[];
  totals: PortfolioTotals;
  selected: number;
  onSelect: (i: number) => void;
  currency: string;
}) {
  // Passthrough columns come from whatever the workbook actually carried. Naming
  // one here would show an empty column for any file that did not have it.
  const passthroughKeys = [...new Set(scored.flatMap((s) => Object.keys(s.passthrough)))].slice(0, 2);

  return (
    <Panel
      eyebrow="05"
      title="Portfolio"
      note="Same engine, every site"
      detail="Rows that cannot be calculated appear with blank figures and a status of model incomplete, never a zero and never a guess."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Sites priced" value={`${totals.priced} of ${totals.sites}`} sub={`${totals.incomplete} incomplete`} />
        <Stat
          label="Manual cost"
          value={formatCurrency(totals.manualCost, currency)}
          sub={`${formatCurrency(totals.addressableManualCost, currency)} of it addressable`}
          tone="warn"
        />
        <Stat
          label="Autonomous cost"
          value={formatCurrency(totals.autoCost, currency)}
          sub={`${totals.docks} docks, ${totals.operators} operators`}
          tone="good"
        />
        <Stat
          label="Blended cost ratio"
          value={totals.costRatio === null ? INCOMPLETE : formatPercent(totals.costRatio)}
          sub={
            totals.programmeCostRatio === null
              ? 'on the addressable scope'
              : `on the addressable scope; total programme ${formatPercent(totals.programmeCostRatio)}`
          }
          tone="accent"
        />
      </div>

      <div className="overflow-x-auto border border-line-soft">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-accent-soft">
              {[
                'Customer',
                'Site',
                ...passthroughKeys,
                'Manual cost',
                'Autonomous cost',
                'Saving',
                'Ratio (current)',
                'Ratio (target)',
                'Payback',
                'Docks',
                'Status',
              ].map((h, i) => (
                <th
                  key={h}
                  className={`font-semibold px-3 py-2 border-b border-line-soft whitespace-nowrap ${
                    i >= 2 + passthroughKeys.length && i <= 8 + passthroughKeys.length
                      ? 'text-right'
                      : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scored.map((s) => {
              const okRow = s.result.status === 'ok';
              const c = okRow ? s.result.current : null;
              const blank = <span className="text-muted" aria-label="not priced"></span>;
              return (
                <tr
                  key={s.index}
                  onClick={() => onSelect(s.index)}
                  className={`cursor-pointer hover:bg-accent-soft/40 ${
                    s.index === selected ? 'bg-accent-soft/60' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 border-b border-line-soft font-medium whitespace-nowrap">
                    {s.customer}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft whitespace-nowrap">{s.site}</td>
                  {passthroughKeys.map((k) => {
                    const v = s.passthrough[k] ?? '';
                    return (
                      <td
                        key={k}
                        className="px-3 py-1.5 border-b border-line-soft text-muted max-w-[18ch] truncate"
                        title={v}
                      >
                        {v}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum whitespace-nowrap">
                    {c ? formatCurrency(c.manualCost, currency) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum whitespace-nowrap">
                    {c ? formatCurrency(c.autoCost, currency) : blank}
                  </td>
                  <td
                    className={`px-3 py-1.5 border-b border-line-soft text-right tnum whitespace-nowrap ${
                      c && c.saving < 0 ? 'text-warn' : ''
                    }`}
                  >
                    {c ? formatCurrency(c.saving, currency) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">
                    {c ? formatPercent(c.costRatio) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">
                    {s.result.status === 'ok' ? formatPercent(s.result.target.costRatio) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum whitespace-nowrap">
                    {c ? (c.paybackMonths === null ? <span className="text-warn">none</span> : formatMonths(c.paybackMonths)) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">
                    {c ? c.docks : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-line-soft whitespace-nowrap">
                    {!okRow ? (
                      <span className="text-warn">model incomplete</span>
                    ) : s.result.tierImprovesAtTarget ? (
                      <span className="text-good">tier improves at target</span>
                    ) : s.result.tierWeakensAtTarget ? (
                      <span className="text-warn">tier weakens at target</span>
                    ) : (
                      <span className="text-muted">calculated</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[0.75rem] text-muted mt-3">
        Select a row to load that site into the model above.{' '}
        {passthroughKeys.length > 0 ? (
          <>
            Unrecognised input columns (
            {passthroughKeys.map((k, i) => (
              <span key={k}>
                {i > 0 && ', '}
                <span className="font-medium">{k}</span>
              </span>
            ))}
            ) are carried through untouched.
          </>
        ) : (
          'This workbook carried no unrecognised columns.'
        )}
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------- exceptions */

export function Exceptions({ scored }: { scored: ScoredSite[] }) {
  const rows = scored.flatMap((s) => [
    ...s.result.issues.map((i) => ({ s, text: i.reason, kind: 'invalid' as const })),
    ...s.result.warnings.map((w) => ({ s, text: w.message, kind: 'warning' as const })),
  ]);

  const invalid = rows.filter((r) => r.kind === 'invalid').length;
  const warned = rows.length - invalid;

  // An empty section still renders. Returning null here left the canvas blank
  // when the navigator said there was a section to look at, which reads as a
  // broken page rather than a clean portfolio. The workbook is the opposite
  // case: there the sheet is omitted when empty, because a blank sheet in a
  // client deliverable is clutter.
  if (rows.length === 0) {
    return (
      <Panel
        eyebrow="06"
        title="Exceptions"
        note="Not priced, or priced with a caution"
      >
        <div className="border border-good bg-good-soft px-5 py-4 flex flex-col gap-1">
          <div className="eyebrow text-good">Nothing to report</div>
          <p className="text-[0.9375rem]">
            All {scored.length} row{scored.length === 1 ? '' : 's'} priced cleanly. No missing
            fields, no unusable values, and no implausible scale factors.
          </p>
          <p className="text-[0.75rem] text-muted mt-1 max-w-[70ch]">
            This sheet is omitted entirely from the exported workbook when it is empty. It stays
            visible here so the section is never a blank page.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      eyebrow="06"
      title="Exceptions"
      note={`${invalid} row${invalid === 1 ? '' : 's'} not priced, ${warned} priced with a caution.`}
    >
      <div className="overflow-x-auto border border-line-soft">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-accent-soft">
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Customer</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Site</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Kind</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 border-b border-line-soft whitespace-nowrap font-medium">
                  {r.s.customer}
                </td>
                <td className="px-3 py-1.5 border-b border-line-soft whitespace-nowrap">{r.s.site}</td>
                <td className="px-3 py-1.5 border-b border-line-soft whitespace-nowrap">
                  <span className={r.kind === 'invalid' ? 'text-warn' : 'text-accent'}>{r.kind}</span>
                </td>
                <td className="px-3 py-1.5 border-b border-line-soft">{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------ parameter sources */

export function ParamSources({ site }: { site: ScoredSite }) {
  return (
    <Panel
      eyebrow="07"
      title="Where each parameter came from"
      note="Provenance of every parameter"
      detail="Resolution order: per-row override, then the Parameters sheet, then the built-in default. A tier that supplies an invalid value is recorded as rejected rather than skipped silently."
    >
      <div className="overflow-x-auto border border-line-soft">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-accent-soft">
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Parameter</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-line-soft">Value</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-line-soft">Source</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(site.resolution).map(([key, r]) => (
              <tr key={key}>
                <td className="px-3 py-1.5 border-b border-line-soft font-medium">{key}</td>
                <td className="px-3 py-1.5 border-b border-line-soft text-right tnum">{String(r.value)}</td>
                <td className="px-3 py-1.5 border-b border-line-soft">
                  <span
                    className={
                      r.source === 'row override'
                        ? 'text-accent font-medium'
                        : r.source === 'Parameters sheet'
                          ? 'text-ink'
                          : 'text-muted'
                    }
                  >
                    {r.source}
                  </span>
                  {r.rejected && <span className="text-warn"> · {r.rejected}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
