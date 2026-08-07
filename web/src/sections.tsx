import type { ModelResult, Params, ScenarioMetrics } from '../../core/index.js';
import {
  INCOMPLETE,
  formatCount,
  formatCurrency,
  formatMonths,
  formatMultiple,
  formatPercent,
  formatResources,
  formatReturn,
} from '../../core/index.js';
import type { ScoredSite, PortfolioTotals } from './scoring.js';

/* ------------------------------------------------------------------ shared */

export function Panel({
  eyebrow,
  title,
  children,
  note,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="print-section bg-panel border border-rule">
      <header className="border-b border-rule px-5 py-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          {eyebrow && <div className="eyebrow text-steel">{eyebrow}</div>}
          <h2 className="text-[1.0625rem] font-semibold tracking-tight">{title}</h2>
        </div>
        {note && <p className="text-[0.75rem] text-muted max-w-[46ch]">{note}</p>}
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
  tone?: 'ink' | 'moss' | 'amber' | 'steel';
}) {
  const toneClass =
    tone === 'moss'
      ? 'text-moss'
      : tone === 'amber'
        ? 'text-amber'
        : tone === 'steel'
          ? 'text-steel'
          : 'text-ink';
  return (
    <div className="border border-rule bg-panel px-4 py-3 flex flex-col gap-1">
      <div className="eyebrow text-muted">{label}</div>
      <div className={`text-[1.5rem] leading-none font-semibold tnum ${toneClass}`}>{value}</div>
      {sub && <div className="text-[0.75rem] text-muted leading-snug">{sub}</div>}
    </div>
  );
}

export function Incomplete({ result }: { result: ModelResult }) {
  return (
    <div className="border border-amber bg-amber-tint px-5 py-4 flex flex-col gap-2">
      <div className="eyebrow text-amber">Model incomplete</div>
      <p className="text-[0.9375rem] max-w-[60ch]">
        The model is not calculated because a required answer is missing or unusable. No value is
        substituted for a missing answer.
      </p>
      <ul className="text-[0.875rem] flex flex-col gap-1 mt-1">
        {result.issues.map((issue, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-amber select-none">
              &bull;
            </span>
            <span>{issue.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Warnings({ result }: { result: ModelResult }) {
  if (result.warnings.length === 0) return null;
  return (
    <div className="border border-amber bg-amber-tint px-4 py-3 flex flex-col gap-1 mb-4">
      <div className="eyebrow text-amber">Check before use</div>
      {result.warnings.map((w, i) => (
        <p key={i} className="text-[0.8125rem] max-w-[70ch]">
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
      note="Autonomous annual cost as a percentage of the manual annual cost, at the current area."
    >
      <Warnings result={result} />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
        <div>
          <div className="eyebrow text-muted mb-1">Cost ratio, current area</div>
          <div className="text-[4.5rem] leading-[0.9] font-semibold tnum text-moss">
            {formatPercent(c.costRatio)}
          </div>
        </div>
        <div className="pb-2 max-w-[34ch]">
          <p className="text-[0.875rem] text-muted leading-snug">
            Autonomous costs {formatPercent(c.costRatio)} of what the manual programme costs at this
            area. Target area: {formatPercent(result.target.costRatio)}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Stat
          label="Annual saving"
          value={formatCurrency(c.saving, params.currency)}
          sub="Manual cost less autonomous cost"
          tone={c.saving >= 0 ? 'moss' : 'amber'}
        />
        <Stat
          label="Return on autonomous spend"
          value={formatReturn(c.returnPct)}
          sub="Saving ÷ autonomous cost. Excludes implementation."
          tone={(c.returnPct ?? 0) >= 0 ? 'moss' : 'amber'}
        />
        <Stat
          label="Payback"
          value={c.paybackMonths === null ? 'None at these inputs' : `${formatMonths(c.paybackMonths)} months`}
          sub={`Implementation ${formatCurrency(params.implCost, params.currency)} ÷ monthly saving`}
          tone={c.paybackMonths === null ? 'amber' : 'ink'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Hours multiple"
          value={formatMultiple(c.hoursMultiple)}
          sub="Dock hours per year vs one manual resource"
          tone="steel"
        />
        <Stat label="Docks required" value={formatCount(c.docks)} sub="Rounded up, because a dock is a purchase" />
        <Stat
          label="Operators required"
          value={formatCount(c.operators)}
          sub={`Rounded up from ${formatCount(c.docks)} docks at ${c.ratioUsed}:1`}
        />
      </div>

      <div className="mt-5 border-t border-rule pt-4 flex flex-col gap-1">
        <div className="eyebrow text-steel">Rule-derived assessment</div>
        <p className="text-[0.9375rem] font-medium">{result.recommendation}</p>
        {tierNote && <p className="text-[0.8125rem] text-amber">{tierNote}</p>}
        <p className="text-[0.75rem] text-muted mt-1 max-w-[70ch]">
          Derived from the stated rule at these inputs. Not a guarantee, forecast or prediction of
          outcome.
        </p>
      </div>
    </Panel>
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
  const max = Math.max(...pairs.flatMap((p) => [p.m.manualCost, p.m.autoCost]));

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
      note="Manual cost scales linearly with area. Autonomous cost scales sub-linearly, because docks and operators round up in steps."
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px] h-auto"
          role="img"
          aria-label="Manual versus autonomous annual cost at current and target area"
        >
          <line x1={padL} y1={plotH + 34} x2={W - padL} y2={plotH + 34} stroke="#CFD8D6" strokeWidth={1} />
          {pairs.map((pair, i) => {
            const gx = padL + i * groupW;
            const cx = gx + groupW / 2;
            const x1 = cx - barW - gap / 2;
            const x2 = cx + gap / 2;
            const bars = [
              { x: x1, v: pair.m.manualCost, fill: '#FBEEDF', stroke: '#B4600F', label: 'Manual' },
              { x: x2, v: pair.m.autoCost, fill: '#E4EFE8', stroke: '#2F6B4F', label: 'Autonomous' },
            ];
            return (
              <g key={pair.label}>
                {bars.map((b) => (
                  <g key={b.label}>
                    <rect
                      x={b.x}
                      y={y(b.v)}
                      width={barW}
                      height={plotH + 34 - y(b.v)}
                      fill={b.fill}
                      stroke={b.stroke}
                      strokeWidth={1}
                    />
                    <text
                      x={b.x + barW / 2}
                      y={y(b.v) - 8}
                      textAnchor="middle"
                      fontSize={12.5}
                      fontWeight={600}
                      fill="#0E1C24"
                    >
                      {formatCurrency(b.v, params.currency)}
                    </text>
                    <text
                      x={b.x + barW / 2}
                      y={plotH + 50}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#63767E"
                    >
                      {b.label}
                    </text>
                  </g>
                ))}
                <text x={cx} y={plotH + 68} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0E1C24">
                  {pair.label}
                </text>
                <text x={cx} y={plotH + 84} textAnchor="middle" fontSize={11.5} fill="#2F6B4F">
                  Saving {formatCurrency(pair.m.saving, params.currency)} · ratio{' '}
                  {formatPercent(pair.m.costRatio)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[0.8125rem]">
        <div className="border border-rule px-4 py-3">
          <div className="eyebrow text-amber mb-1">Manual, linear</div>
          Resources scale by {result.target.scaleFactor.toFixed(2)}×, so manual cost scales by the
          same {result.target.scaleFactor.toFixed(2)}×.
        </div>
        <div className="border border-rule px-4 py-3">
          <div className="eyebrow text-moss mb-1">Autonomous, sub-linear</div>
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
      note="Every intermediate line with its formula. A customer engineer can recompute the model on paper from this table alone."
    >
      <div className="overflow-x-auto border border-rule">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-steel-tint">
              <th className="text-left font-semibold px-3 py-2 border-b border-rule whitespace-nowrap">
                Line
              </th>
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Formula</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule whitespace-nowrap">
                Current area
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule whitespace-nowrap">
                Target area
              </th>
            </tr>
          </thead>
          <tbody>
            {result.audit.map((l) => (
              <tr key={l.key} className="align-top">
                <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap font-medium">
                  {l.label}
                </td>
                <td className="px-3 py-1.5 border-b border-rule text-muted">{l.formula}</td>
                <td className="px-3 py-1.5 border-b border-rule text-right tnum whitespace-nowrap">
                  {render(l.current, l.kind)}
                </td>
                <td className="px-3 py-1.5 border-b border-rule text-right tnum whitespace-nowrap">
                  {render(l.target, l.kind)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-4 border border-rule">
        <summary className="px-4 py-2 cursor-pointer text-[0.8125rem] font-medium bg-steel-tint">
          Show the working, with this site's own numbers substituted
        </summary>
        <div className="px-4 py-3 flex flex-col gap-2 text-[0.75rem]">
          {result.audit.map((l) => (
            <div key={l.key} className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-0.5">
              <div className="font-medium">{l.label}</div>
              <div className="text-muted">
                <div>
                  <span className="text-steel">current</span> {l.currentWorking}
                </div>
                <div>
                  <span className="text-steel">target</span> {l.targetWorking}
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

  return (
    <Panel
      eyebrow="04"
      title="Sensitivity to docks per operator"
      note="Only the operator term moves. The dock count is set by manual hours and the substitution factor, neither of which this ratio touches."
    >
      <div className="overflow-x-auto border border-rule">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-steel-tint">
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">
                Docks per operator
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule">Docks</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule">Operators</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule">
                Autonomous cost
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule">Cost ratio</th>
            </tr>
          </thead>
          <tbody>
            {result.sensitivity.map((s) => {
              const isCurrent = s.ratio === params.ratioNow;
              return (
                <tr key={s.ratio} className={isCurrent ? 'bg-steel-tint/50' : undefined}>
                  <td className="px-3 py-1.5 border-b border-rule font-medium">
                    {s.ratio}:1{isCurrent && <span className="text-steel font-normal"> current</span>}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">{s.docks}</td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">{s.operators}</td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">
                    {formatCurrency(s.autoCost, params.currency)}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">
                    {formatPercent(s.costRatio)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[0.75rem] text-muted mt-3 max-w-[74ch]">
        Reported for the current area. Operators round up from the whole dock count at every ratio, so
        the cost steps rather than sliding.
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
  return (
    <Panel
      eyebrow="05"
      title="Portfolio"
      note="Every site scored through the identical engine. Rows that cannot be calculated appear here with blank figures, never a zero."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Sites priced" value={`${totals.priced} of ${totals.sites}`} sub={`${totals.incomplete} incomplete`} />
        <Stat label="Manual cost" value={formatCurrency(totals.manualCost, currency)} tone="amber" />
        <Stat label="Autonomous cost" value={formatCurrency(totals.autoCost, currency)} tone="moss" />
        <Stat
          label="Blended cost ratio"
          value={totals.costRatio === null ? INCOMPLETE : formatPercent(totals.costRatio)}
          sub={`${totals.docks} docks · ${totals.operators} operators`}
          tone="steel"
        />
      </div>

      <div className="overflow-x-auto border border-rule">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-steel-tint">
              {[
                'Customer',
                'Site',
                'Region',
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
                  className={`font-semibold px-3 py-2 border-b border-rule whitespace-nowrap ${
                    i >= 3 && i <= 9 ? 'text-right' : 'text-left'
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
                  className={`cursor-pointer hover:bg-steel-tint/40 ${
                    s.index === selected ? 'bg-steel-tint/60' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 border-b border-rule font-medium whitespace-nowrap">
                    {s.customer}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap">{s.site}</td>
                  <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap text-muted">
                    {s.passthrough.Region ?? ''}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum whitespace-nowrap">
                    {c ? formatCurrency(c.manualCost, currency) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum whitespace-nowrap">
                    {c ? formatCurrency(c.autoCost, currency) : blank}
                  </td>
                  <td
                    className={`px-3 py-1.5 border-b border-rule text-right tnum whitespace-nowrap ${
                      c && c.saving < 0 ? 'text-amber' : ''
                    }`}
                  >
                    {c ? formatCurrency(c.saving, currency) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">
                    {c ? formatPercent(c.costRatio) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">
                    {s.result.status === 'ok' ? formatPercent(s.result.target.costRatio) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum whitespace-nowrap">
                    {c ? (c.paybackMonths === null ? <span className="text-amber">none</span> : formatMonths(c.paybackMonths)) : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule text-right tnum">
                    {c ? c.docks : blank}
                  </td>
                  <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap">
                    {!okRow ? (
                      <span className="text-amber">model incomplete</span>
                    ) : s.result.tierImprovesAtTarget ? (
                      <span className="text-moss">tier improves at target</span>
                    ) : s.result.tierWeakensAtTarget ? (
                      <span className="text-amber">tier weakens at target</span>
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
        Select a row to load that site into the model above. Unrecognised input columns such as{' '}
        <span className="font-medium">Region</span> and <span className="font-medium">Notes</span> are
        carried through untouched.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------- exceptions */

export function Exceptions({ scored }: { scored: ScoredSite[] }) {
  const rows = scored.flatMap((s) =>
    [
      ...s.result.issues.map((i) => ({ s, text: i.reason, kind: 'invalid' as const })),
      ...s.result.warnings.map((w) => ({ s, text: w.message, kind: 'warning' as const })),
    ].map((r) => r),
  );
  if (rows.length === 0) return null;

  return (
    <Panel eyebrow="06" title="Exceptions" note="Rows that could not be priced, and rows priced with a caution.">
      <div className="overflow-x-auto border border-rule">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-steel-tint">
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Customer</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Site</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Kind</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap font-medium">
                  {r.s.customer}
                </td>
                <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap">{r.s.site}</td>
                <td className="px-3 py-1.5 border-b border-rule whitespace-nowrap">
                  <span className={r.kind === 'invalid' ? 'text-amber' : 'text-steel'}>{r.kind}</span>
                </td>
                <td className="px-3 py-1.5 border-b border-rule">{r.text}</td>
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
      note="Resolution order: per-row override, then the Parameters sheet, then the built-in default. Never a silent fallback."
    >
      <div className="overflow-x-auto border border-rule">
        <table className="w-full text-[0.8125rem] border-collapse">
          <thead>
            <tr className="bg-steel-tint">
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Parameter</th>
              <th className="text-right font-semibold px-3 py-2 border-b border-rule">Value</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-rule">Source</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(site.resolution).map(([key, r]) => (
              <tr key={key}>
                <td className="px-3 py-1.5 border-b border-rule font-medium">{key}</td>
                <td className="px-3 py-1.5 border-b border-rule text-right tnum">{String(r.value)}</td>
                <td className="px-3 py-1.5 border-b border-rule">
                  <span
                    className={
                      r.source === 'row override'
                        ? 'text-steel font-medium'
                        : r.source === 'Parameters sheet'
                          ? 'text-ink'
                          : 'text-muted'
                    }
                  >
                    {r.source}
                  </span>
                  {r.rejected && <span className="text-amber"> · {r.rejected}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
