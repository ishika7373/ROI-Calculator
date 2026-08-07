import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PARAMS, runModel } from '../../core/index.js';
import type { DiscoveryInputs, Params } from '../../core/index.js';
import { scorePortfolio, totalsFor } from './scoring.js';
import { download, exceptionsCsv, portfolioCsv, scenarioCsv } from './exports.js';
import {
  Audit,
  Comparison,
  Exceptions,
  Headline,
  ParamSources,
  Portfolio,
  Sensitivity,
} from './sections.js';

/** The six questions the salesperson asks out loud, verbatim. */
const QUESTIONS: Record<keyof Discovery, { label: string; question: string; unit?: string }> = {
  area: {
    label: 'Current survey area',
    question: 'How much area do you survey today?',
    unit: 'sq ft',
  },
  resources: {
    label: 'Manual resources deployed',
    question: 'How many people are deployed on that inspection work?',
  },
  salary: {
    label: 'Fully loaded cost per resource',
    question: 'What does one of those people cost you, fully loaded, per year?',
    unit: 'per year',
  },
  targetArea: {
    label: 'Target future area',
    question: 'What area do you need to cover once this scales?',
    unit: 'sq ft',
  },
  shiftHours: {
    label: 'Shift hours per day',
    question: 'How many hours is a shift?',
  },
  workDays: {
    label: 'Working days per year',
    question: 'How many days a year does the crew work?',
  },
};

type Discovery = {
  area: string;
  resources: string;
  salary: string;
  targetArea: string;
  shiftHours: string;
  workDays: string;
};

const EMPTY: Discovery = {
  area: '',
  resources: '',
  salary: '',
  targetArea: '',
  shiftHours: '',
  workDays: '',
};

const PARAM_FIELDS: {
  key: keyof Omit<Params, 'currency'>;
  label: string;
  step?: number;
  help?: string;
}[] = [
  { key: 'dockHours', label: 'Dock operating hours per day' },
  { key: 'dockDays', label: 'Operating days per year' },
  {
    key: 'subFactor',
    label: 'Substitution factor (drone hr : labour hr)',
    step: 0.1,
    help: 'The key uncertainty in this model. 1.0 is deliberately conservative: a docked drone does not spend time mobilising to the asset, so the true figure is likely higher. Raise it only against evidence from this site.',
  },
  { key: 'dockCost', label: 'Cost per dock per year' },
  { key: 'opCost', label: 'Cost per operator per year' },
  { key: 'ratioNow', label: 'Docks per operator today', step: 0.5 },
  { key: 'ratioScale', label: 'Docks per operator at scale', step: 0.5 },
  { key: 'implCost', label: 'One-time implementation' },
];

const SECTIONS = [
  { id: 'headline', n: '01', label: 'Headline' },
  { id: 'comparison', n: '02', label: 'Cost comparison' },
  { id: 'audit', n: '03', label: 'Audit trail' },
  { id: 'sensitivity', n: '04', label: 'Sensitivity' },
  { id: 'portfolio', n: '05', label: 'Portfolio' },
  { id: 'exceptions', n: '06', label: 'Exceptions' },
  { id: 'sources', n: '07', label: 'Parameter sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

interface SavedScenario {
  name: string;
  discovery: Discovery;
  params: Params;
}

const STORAGE_KEY = 'drone-roi.scenarios.v1';

/* ------------------------------------------------------------------ URL IO */

function readUrl(): { discovery: Discovery; params: Params } | null {
  const q = new URLSearchParams(window.location.search);
  if ([...q.keys()].length === 0) return null;
  const discovery = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof Discovery)[]) {
    const v = q.get(k);
    if (v !== null) discovery[k] = v;
  }
  const params = { ...DEFAULT_PARAMS };
  for (const { key } of PARAM_FIELDS) {
    const v = q.get(key);
    if (v !== null && v !== '' && Number.isFinite(Number(v))) params[key] = Number(v);
  }
  const cur = q.get('currency');
  if (cur) params.currency = cur;
  return { discovery, params };
}

function writeUrl(discovery: Discovery, params: Params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(discovery)) if (v !== '') q.set(k, v);
  for (const { key } of PARAM_FIELDS) {
    if (params[key] !== DEFAULT_PARAMS[key]) q.set(key, String(params[key]));
  }
  if (params.currency !== DEFAULT_PARAMS.currency) q.set('currency', params.currency);
  const url = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
  window.history.replaceState(null, '', url);
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const scored = useMemo(() => scorePortfolio(), []);
  const [selectedSite, setSelectedSite] = useState(0);
  const [discovery, setDiscovery] = useState<Discovery>(EMPTY);
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS });
  const [section, setSection] = useState<SectionId>('headline');
  const [documentView, setDocumentView] = useState(false);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [compare, setCompare] = useState<[string, string]>(['', '']);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const initialised = useRef(false);

  // Load from the URL if present, otherwise from the first mock site.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const fromUrl = readUrl();
    if (fromUrl) {
      setDiscovery(fromUrl.discovery);
      setParams(fromUrl.params);
    } else {
      loadSite(0);
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      /* a corrupt store is not worth failing the app over */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every input change re-encodes the URL. The address bar is the shareable scenario.
  useEffect(() => {
    if (!initialised.current) return;
    writeUrl(discovery, params);
  }, [discovery, params]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function loadSite(index: number) {
    const s = scored[index];
    if (!s) return;
    setSelectedSite(index);
    const r = s.raw;
    const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    setDiscovery({
      area: str(r['Current Survey Area (sq ft)']),
      resources: str(r['Manual Resources']),
      salary: str(r['Salary per Resource ($/yr)']),
      targetArea: str(r['Target Area (sq ft)']),
      shiftHours: str(r['Shift Hours']),
      workDays: str(r['Working Days']),
    });
    setParams({ ...s.params });
  }

  const inputs: DiscoveryInputs = {
    area: discovery.area,
    resources: discovery.resources,
    salary: discovery.salary,
    targetArea: discovery.targetArea,
    shiftHours: discovery.shiftHours,
    workDays: discovery.workDays,
  };

  const result = useMemo(() => runModel(inputs, params), [discovery, params]);
  const totalsCurrent = useMemo(() => totalsFor(scored, 'current'), [scored]);

  const set = useCallback(
    (key: keyof Discovery, value: string) => setDiscovery((d) => ({ ...d, [key]: value })),
    [],
  );

  /* ------------------------------------------------------------- exports */

  const siteLabel = scored[selectedSite]
    ? `${scored[selectedSite]!.customer} — ${scored[selectedSite]!.site}`
    : 'Custom scenario';

  function exportScenarioCsv() {
    download(
      `drone-roi-scenario-${siteLabel.replace(/\W+/g, '-').toLowerCase()}.csv`,
      scenarioCsv(result, params, siteLabel),
      'text/csv;charset=utf-8',
    );
    setToast('Scenario CSV downloaded');
  }

  function exportPortfolioCsv() {
    download('drone-roi-portfolio.csv', portfolioCsv(scored), 'text/csv;charset=utf-8');
    setToast('Portfolio CSV downloaded');
  }

  function exportExceptionsCsv() {
    download('drone-roi-exceptions.csv', exceptionsCsv(scored), 'text/csv;charset=utf-8');
    setToast('Exceptions CSV downloaded');
  }

  async function exportWorkbook() {
    setToast('Building workbook…');
    try {
      const { buildWorkbookBytes } = await import('./workbook-client.js');
      const bytes = await buildWorkbookBytes(scored);
      download(
        'Drone_ROI_Output.xlsx',
        bytes as unknown as BlobPart,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      setToast('Workbook downloaded, with native charts');
    } catch (err) {
      console.error(err);
      setToast(`Workbook failed: ${(err as Error).message}`);
    }
  }

  /* ---------------------------------------------------------- scenarios */

  function persist(next: SavedScenario[]) {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setToast('Could not save — browser storage unavailable');
    }
  }

  function saveScenario() {
    const name = window.prompt('Name this scenario', siteLabel);
    if (!name) return;
    persist([...saved.filter((s) => s.name !== name), { name, discovery, params }]);
    setToast(`Saved "${name}"`);
  }

  const compareA = saved.find((s) => s.name === compare[0]);
  const compareB = saved.find((s) => s.name === compare[1]);

  /* ------------------------------------------------------------ dropzone */

  async function handleFile(file: File) {
    setToast(`Reading ${file.name}…`);
    try {
      const { readWorkbookRows } = await import('./workbook-client.js');
      const rows = await readWorkbookRows(await file.arrayBuffer());
      setToast(`${rows} row(s) read — scoring uses the identical engine`);
    } catch (err) {
      setToast(`Could not read that workbook: ${(err as Error).message}`);
    }
  }

  /* --------------------------------------------------------------- view */

  const canvas = (
    <>
      {(documentView || section === 'headline') && (
        <div id="headline">
          <Headline result={result} params={params} />
        </div>
      )}
      {(documentView || section === 'comparison') && (
        <div id="comparison">
          <Comparison result={result} params={params} />
        </div>
      )}
      {(documentView || section === 'audit') && (
        <div id="audit">
          <Audit result={result} params={params} />
        </div>
      )}
      {(documentView || section === 'sensitivity') && (
        <div id="sensitivity">
          <Sensitivity result={result} params={params} />
        </div>
      )}
      {(documentView || section === 'portfolio') && (
        <div id="portfolio">
          <Portfolio
            scored={scored}
            totals={totalsCurrent}
            selected={selectedSite}
            onSelect={loadSite}
            currency={params.currency}
          />
        </div>
      )}
      {(documentView || section === 'exceptions') && (
        <div id="exceptions">
          <Exceptions scored={scored} />
        </div>
      )}
      {(documentView || section === 'sources') && scored[selectedSite] && (
        <div id="sources">
          <ParamSources site={scored[selectedSite]!} />
        </div>
      )}
    </>
  );

  return (
    <div
      className="min-h-full flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
    >
      {/* ------------------------------------------------------- header */}
      <header className="no-print border-b border-rule bg-panel sticky top-0 z-20">
        <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap max-w-full">
          <div>
            <div className="eyebrow text-steel">Discovery model</div>
            <h1 className="text-[1.125rem] font-semibold tracking-tight">
              Autonomous Inspection ROI
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full min-w-0 lg:w-auto">
            <select
              className="field w-full min-w-0 lg:w-auto lg:max-w-[16rem] text-[0.8125rem]"
              value={selectedSite}
              onChange={(e) => loadSite(Number(e.target.value))}
              aria-label="Load a site from the portfolio"
            >
              {scored.map((s) => (
                <option key={s.index} value={s.index}>
                  {s.customer} — {s.site}
                </option>
              ))}
            </select>

            <button
              onClick={() => setDocumentView((v) => !v)}
              className={`px-3 py-2 text-[0.8125rem] border ${
                documentView ? 'border-steel bg-steel-tint text-ink' : 'border-rule bg-panel'
              }`}
            >
              {documentView ? 'Section view' : 'Document view'}
            </button>

            <div className="flex border border-rule overflow-x-auto max-w-full">
              <button onClick={exportScenarioCsv} className="px-3 py-2 text-[0.8125rem] border-r border-rule bg-panel hover:bg-steel-tint whitespace-nowrap">
                Scenario CSV
              </button>
              <button onClick={exportPortfolioCsv} className="px-3 py-2 text-[0.8125rem] border-r border-rule bg-panel hover:bg-steel-tint whitespace-nowrap">
                Portfolio CSV
              </button>
              <button onClick={exportExceptionsCsv} className="px-3 py-2 text-[0.8125rem] border-r border-rule bg-panel hover:bg-steel-tint whitespace-nowrap">
                Exceptions
              </button>
              <button onClick={exportWorkbook} className="px-3 py-2 text-[0.8125rem] border-r border-rule bg-panel hover:bg-steel-tint font-medium whitespace-nowrap">
                Workbook
              </button>
              <button onClick={() => window.print()} className="px-3 py-2 text-[0.8125rem] bg-panel hover:bg-steel-tint whitespace-nowrap">
                Print / PDF
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-0">
        {/* left rail */}
        <aside className="no-print border-r border-rule bg-paper overflow-y-auto thin-scroll lg:max-h-[calc(100vh-61px)]">
          <div className="p-5 flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="eyebrow text-steel">Discovery</div>
                  <p className="text-[0.75rem] text-muted mt-0.5">The customer supplies these.</p>
                </div>
                <button
                  onClick={() => {
                    setDiscovery(EMPTY);
                    setParams({ ...DEFAULT_PARAMS });
                  }}
                  className="text-[0.75rem] text-steel underline underline-offset-2"
                >
                  Clear
                </button>
              </div>

              {(Object.keys(QUESTIONS) as (keyof Discovery)[]).map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <label htmlFor={key} className="text-[0.8125rem] font-medium">
                    {QUESTIONS[key].label}
                    {QUESTIONS[key].unit && (
                      <span className="text-muted font-normal"> ({QUESTIONS[key].unit})</span>
                    )}
                  </label>
                  <p className="question">{QUESTIONS[key].question}</p>
                  <input
                    id={key}
                    className="field"
                    inputMode="decimal"
                    value={discovery[key]}
                    placeholder="—"
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {/* autonomous side, visually separated */}
            <div className="border border-steel bg-steel-tint/40">
              <div className="px-4 py-3 border-b border-steel/40">
                <div className="eyebrow text-steel">Supplied by us</div>
                <p className="text-[0.75rem] text-muted mt-1">
                  Placeholders. Not commercial figures — replace before customer use.
                </p>
              </div>
              <div className="p-4 flex flex-col gap-3">
                {PARAM_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label htmlFor={f.key} className="text-[0.8125rem] font-medium">
                      {f.label}
                    </label>
                    {f.help && <p className="question text-amber">{f.help}</p>}
                    <input
                      id={f.key}
                      className="field"
                      type="number"
                      step={f.step ?? 1}
                      value={params[f.key]}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, [f.key]: Number(e.target.value) }))
                      }
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label htmlFor="currency" className="text-[0.8125rem] font-medium">
                    Currency
                  </label>
                  <p className="question">
                    The model is unit-agnostic; this only labels the figures.
                  </p>
                  <input
                    id="currency"
                    className="field"
                    value={params.currency}
                    onChange={(e) => setParams((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>
            </div>

            {/* saved scenarios */}
            <div className="flex flex-col gap-2">
              <div className="eyebrow text-steel">Saved scenarios</div>
              <button
                onClick={saveScenario}
                className="border border-rule bg-panel px-3 py-2 text-[0.8125rem] hover:bg-steel-tint text-left"
              >
                Save current scenario
              </button>
              {saved.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1].map((i) => (
                      <select
                        key={i}
                        className="field text-[0.75rem]"
                        value={compare[i]}
                        aria-label={`Comparison slot ${i + 1}`}
                        onChange={(e) =>
                          setCompare((c) => {
                            const next: [string, string] = [...c];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                      >
                        <option value="">Compare…</option>
                        {saved.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                  {compareA && compareB && (
                    <CompareTable a={compareA} b={compareB} />
                  )}
                </>
              )}
            </div>

            {/* batch upload */}
            <div className="border border-dashed border-rule px-4 py-5 text-center">
              <div className="eyebrow text-steel mb-1">Batch workbook</div>
              <p className="text-[0.75rem] text-muted">
                Drop an .xlsx anywhere on this page to score it with the identical engine, or use the
                Workbook button to download the current portfolio.
              </p>
            </div>
          </div>
        </aside>

        {/* canvas */}
        <main className="overflow-y-auto thin-scroll lg:max-h-[calc(100vh-61px)] print-stack">
          <div className="p-5 flex flex-col gap-4 print-compact">{canvas}</div>

          {/* section navigator */}
          {!documentView && (
            <nav className="no-print sticky bottom-0 bg-paper border-t border-rule px-5 py-3 flex gap-2 overflow-x-auto">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 text-left px-3 py-2 border min-w-[8.5rem] ${
                    section === s.id
                      ? 'border-steel bg-steel-tint'
                      : 'border-rule bg-panel hover:bg-steel-tint/50'
                  }`}
                >
                  <div className="eyebrow text-muted">Section {s.n}</div>
                  <div className="text-[0.8125rem] font-medium">{s.label}</div>
                </button>
              ))}
            </nav>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------- footer */}
      <footer className="border-t border-rule bg-panel px-5 py-4">
        <p className="text-[0.75rem] text-muted max-w-[100ch] leading-relaxed">
          <span className="font-semibold text-ink">Scope of this model.</span> It prices labour
          displacement only. It excludes avoided scaffolding and rope access, avoided shutdown
          windows, compliance penalty exposure and unplanned downtime — all of which are typically
          larger than the labour line at industrial scale. Autonomous-side defaults are placeholders
          requiring replacement with real commercial figures before customer use. The substitution
          factor is the key uncertainty; 1.0 is deliberately conservative because a docked drone does
          not spend time mobilising to the asset.
        </p>
      </footer>

      {dragging && (
        <div className="fixed inset-0 z-30 bg-steel-tint/90 border-4 border-steel flex items-center justify-center pointer-events-none">
          <p className="text-[1.125rem] font-semibold">Drop the workbook to score it</p>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-40 border border-ink bg-panel px-4 py-3 text-[0.8125rem]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------ comparison table */

function CompareTable({ a, b }: { a: SavedScenario; b: SavedScenario }) {
  const ra = runModel(a.discovery as unknown as DiscoveryInputs, a.params);
  const rb = runModel(b.discovery as unknown as DiscoveryInputs, b.params);

  const line = (label: string, fa: string, fb: string) => (
    <tr key={label}>
      <td className="px-2 py-1 border-b border-rule text-muted">{label}</td>
      <td className="px-2 py-1 border-b border-rule text-right tnum">{fa}</td>
      <td className="px-2 py-1 border-b border-rule text-right tnum">{fb}</td>
    </tr>
  );

  const pct = (r: typeof ra) =>
    r.status === 'ok' ? `${(r.current.costRatio * 100).toFixed(1)}%` : 'incomplete';
  const money = (r: typeof ra, k: 'saving' | 'autoCost') =>
    r.status === 'ok' ? r.current[k].toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
  const count = (r: typeof ra, k: 'docks' | 'operators') =>
    r.status === 'ok' ? String(r.current[k]) : '—';

  return (
    <div className="border border-rule bg-panel overflow-x-auto">
      <table className="w-full text-[0.75rem] border-collapse">
        <thead>
          <tr className="bg-steel-tint">
            <th className="text-left px-2 py-1.5 border-b border-rule font-semibold">Line</th>
            <th className="text-right px-2 py-1.5 border-b border-rule font-semibold">{a.name}</th>
            <th className="text-right px-2 py-1.5 border-b border-rule font-semibold">{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {line('Cost ratio', pct(ra), pct(rb))}
          {line('Annual saving', money(ra, 'saving'), money(rb, 'saving'))}
          {line('Autonomous cost', money(ra, 'autoCost'), money(rb, 'autoCost'))}
          {line('Docks', count(ra, 'docks'), count(rb, 'docks'))}
          {line('Operators', count(ra, 'operators'), count(rb, 'operators'))}
        </tbody>
      </table>
    </div>
  );
}
