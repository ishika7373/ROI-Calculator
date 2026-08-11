import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PARAMS, runModel } from '../../core/index.js';
import type { DiscoveryInputs, Params } from '../../core/index.js';
import { scorePortfolio, totalsFor } from './scoring.js';
import { PORTFOLIO } from '../../fixtures/portfolio.js';
import type { RawRow } from '../../fixtures/portfolio.js';
import { download, exceptionsCsv, portfolioCsv, scenarioCsv } from './exports.js';
import {
  Audit,
  Comparison,
  Exceptions,
  ExecutiveSummary,
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
    key: 'utilisation',
    label: 'Dock utilisation',
    step: 0.05,
    help: 'Share of those operating hours that are actually productive. Weather and daylight limits take roughly half, the battery charge duty cycle takes half again, maintenance and connectivity take a little more. Treating 8,760 hours as productive is what makes a payback look like weeks.',
  },
  {
    key: 'addressableShare',
    label: 'Addressable share of manual hours',
    step: 0.05,
    help: 'How much of the inspection programme a drone can reach at all. External visual and thermal work is addressable. Confined space entry, ultrasonic thickness readings, tactile inspection, permits and reporting are not.',
  },
  {
    key: 'subFactor',
    label: 'Substitution factor (labour hr per productive drone hr)',
    step: 0.1,
    help: 'Held at parity by default so that utilisation and addressable share carry the argument openly, rather than being hidden inside one fudge factor. Raise it only against evidence from this site.',
  },
  { key: 'dockCost', label: 'Cost per dock per year' },
  { key: 'opCost', label: 'Cost per operator per year' },
  { key: 'ratioNow', label: 'Docks per operator today', step: 0.5 },
  { key: 'ratioScale', label: 'Docks per operator at scale', step: 0.5 },
  { key: 'implBase', label: 'Implementation, programme base' },
  {
    key: 'implPerDock',
    label: 'Implementation per dock',
    help: 'Site survey, civils and mounting, power and network, regulatory approval, commissioning, training. Implementation that does not scale with the fleet is the other half of an implausible payback.',
  },
];

/**
 * Currencies offered in the picker.
 *
 * This labels figures, it does not convert them. The model is unit agnostic, so
 * whatever the customer's costs are denominated in is what the outputs mean.
 */
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'Pound sterling' },
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi riyal' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian krone' },
  { code: 'CAD', symbol: '$', name: 'Canadian dollar' },
  { code: 'AUD', symbol: '$', name: 'Australian dollar' },
  { code: 'SGD', symbol: '$', name: 'Singapore dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian real' },
] as const;

const SECTIONS = [
  { id: 'summary', n: '01', label: 'Executive summary' },
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
  // The row set is state, not a constant, so an uploaded workbook genuinely
  // replaces the portfolio rather than being read and discarded.
  const [rows, setRows] = useState<RawRow[]>(PORTFOLIO);
  const [sourceName, setSourceName] = useState<string>('Bundled sample portfolio');
  const scored = useMemo(() => scorePortfolio(rows), [rows]);
  const [selectedSite, setSelectedSite] = useState(0);
  const [discovery, setDiscovery] = useState<Discovery>(EMPTY);
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS });
  const [section, setSection] = useState<SectionId>('summary');
  const [documentView, setDocumentView] = useState(false);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [compare, setCompare] = useState<[string, string]>(['', '']);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenu = useRef<HTMLDivElement>(null);
  /** Which pane is showing below the lg breakpoint. Ignored at lg and above. */
  const [pane, setPane] = useState<'results' | 'inputs'>('results');
  const fileInput = useRef<HTMLInputElement>(null);
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

  // Dismiss the export menu on an outside click or Escape, so it never strands
  // itself open over the numbers during a call.
  useEffect(() => {
    if (!exportOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!exportMenu.current?.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  function loadSite(index: number) {
    const s = scored[index];
    if (!s) return;
    setSelectedSite(index);
    // Values come from the header matcher, not from surfacecoded column names, so
    // a workbook that spells its columns differently still loads correctly.
    setDiscovery({ ...s.discovery });
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
    ? `${scored[selectedSite]!.customer} / ${scored[selectedSite]!.site}`
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

  /** Everything that produces a file, in the order it is usually wanted. */
  const EXPORTS: { label: string; hint: string; run: () => void | Promise<void> }[] = [
    { label: 'Workbook (.xlsx)', hint: 'All sheets, native charts', run: exportWorkbook },
    { label: 'Scenario CSV', hint: 'This site, with audit trail', run: exportScenarioCsv },
    { label: 'Portfolio CSV', hint: `All ${scored.length} sites, one row each`, run: exportPortfolioCsv },
    { label: 'Exceptions CSV', hint: 'Rows not priced, with reasons', run: exportExceptionsCsv },
  ];

  /* ---------------------------------------------------------- scenarios */

  function persist(next: SavedScenario[]) {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setToast('Could not save. Browser storage is unavailable.');
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

  /**
   * Read an uploaded workbook and score it.
   *
   * The parsed rows replace the portfolio, so every section below reflects the
   * uploaded file immediately. Nothing is read and thrown away.
   */
  async function handleFile(file: File) {
    if (!/\.xlsx$/i.test(file.name)) {
      setUploadError(`${file.name} is not an .xlsx workbook. Export it from Excel and try again.`);
      return;
    }
    setBusy(true);
    setUploadError(null);
    setToast(`Reading ${file.name}`);
    try {
      const { readWorkbookRows } = await import('./workbook-client.js');
      const parsed = await readWorkbookRows(await file.arrayBuffer());
      setRows(parsed);
      setSourceName(file.name);
      setSelectedSite(0);
      setSection('portfolio');
      setToast(`${parsed.length} row${parsed.length === 1 ? '' : 's'} scored from ${file.name}`);
    } catch (err) {
      setUploadError((err as Error).message);
      setToast(null);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  /** Return to the bundled sample rows. */
  function resetPortfolio() {
    setRows(PORTFOLIO);
    setSourceName('Bundled sample portfolio');
    setSelectedSite(0);
    setUploadError(null);
    setToast('Reverted to the bundled sample portfolio');
  }

  /* --------------------------------------------------------------- view */

  const canvas = (
    <>
      {(documentView || section === 'summary') && (
        <div id="summary">
          <ExecutiveSummary result={result} params={params} />
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
      <header className="no-print border-b border-line bg-surface sticky top-0 z-20">
        {/*
          A grid below lg so the site selector can take its own row without
          widening its siblings: as a full-width flex item it forced the whole
          control cluster to 335px, which pushed the header to three rows.
        */}
        <div className="relative px-5 py-3 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 lg:flex lg:justify-between lg:gap-4 max-w-full">
          <div className="min-w-0">
            <div className="eyebrow eyebrow-mark text-accent">Discovery model</div>
            <h1 className="text-[1rem] font-semibold text-ink mt-0.5 truncate">
              Autonomous Inspection ROI
            </h1>
          </div>

          <select
            className="field order-3 col-span-2 w-full lg:order-2 lg:col-auto lg:w-auto lg:max-w-[16rem] text-[0.8125rem]"
              value={selectedSite}
              onChange={(e) => loadSite(Number(e.target.value))}
              aria-label="Load a site from the portfolio"
            >
            {scored.map((s) => (
              <option key={s.index} value={s.index}>
                {s.customer} / {s.site}
              </option>
            ))}
          </select>

          <div className="relative flex items-center gap-2 justify-self-end order-2 lg:order-3">
            <button
              onClick={() => setDocumentView((v) => !v)}
              className={`btn max-lg:hidden ${documentView ? 'btn-on' : ''}`}
            >
              {documentView ? 'Section view' : 'Document view'}
            </button>

            {/*
              One control rather than five. Print is the action reached most
              often in a live call, so it stays a button; everything that
              produces a file sits in the menu beside it.
            */}
            <div className="flex">
              <button onClick={() => window.print()} className="btn max-lg:hidden border-r-0">
                Print / PDF
              </button>
              <div className="relative max-sm:static" ref={exportMenu}>
                <button
                  onClick={() => setExportOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  className={`btn px-2 ${exportOpen ? 'btn-on' : ''}`}
                >
                  Export <span aria-hidden>&#9662;</span>
                </button>
                {exportOpen && (
                  <div
                    role="menu"
                    className="absolute top-full mt-2 z-30 surface py-1 right-0 w-[15rem] max-sm:left-0 max-sm:right-0 max-sm:w-auto"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setExportOpen(false);
                        window.print();
                      }}
                      className="lg:hidden w-full text-left px-3 py-2 text-[0.8125rem] hover:bg-accent-soft flex flex-col gap-0.5 border-b border-line"
                    >
                      <span className="font-semibold text-ink">Print / PDF</span>
                      <span className="text-[0.6875rem] text-muted">One page, audit table intact</span>
                    </button>
                    {EXPORTS.map((e) => (
                      <button
                        key={e.label}
                        role="menuitem"
                        onClick={() => {
                          setExportOpen(false);
                          void e.run();
                        }}
                        className="w-full text-left px-3 py-2 text-[0.8125rem] hover:bg-accent-soft flex flex-col gap-0.5"
                      >
                        <span className="font-bold">{e.label}</span>
                        <span className="text-[0.6875rem] text-muted">{e.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- body */}
      {/*
        Below lg the two panes stack, which put the results roughly three
        screens below the fold. On small screens they become tabs instead, and
        the results are the default: the numbers are what the meeting is about,
        and the inputs are one tap away rather than a scroll away.
      */}
      <div className="no-print lg:hidden sticky top-[57px] z-10 flex border-b border-line bg-ground">
        {(
          [
            ['results', 'Results'],
            ['inputs', 'Inputs'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPane(id)}
            aria-pressed={pane === id}
            className={`flex-1 py-3 text-[0.8125rem] font-bold border-r border-line last:border-r-0 ${
              pane === id ? 'bg-accent text-white' : 'bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-0">
        {/* left rail */}
        <aside
          className={`no-print border-r border-line overflow-y-auto thin-scroll lg:max-h-[calc(100vh-61px)] ${
            pane === 'inputs' ? '' : 'max-lg:hidden'
          }`}
        >
          <div className="p-5 flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="eyebrow text-accent">Discovery</div>
                  <p className="text-[0.75rem] text-muted mt-0.5">The customer supplies these.</p>
                </div>
                <button
                  onClick={() => {
                    setDiscovery(EMPTY);
                    setParams({ ...DEFAULT_PARAMS });
                  }}
                  className="tap-target text-[0.75rem] text-accent underline underline-offset-2"
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
                    className="field field-num"
                    inputMode="decimal"
                    value={discovery[key]}
                    placeholder=""
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {/* autonomous side, visually separated */}
            <div className="bg-accent-soft surface">
              <div className="px-4 py-3 border-b border-line">
                <div className="eyebrow text-accent">Supplied by us</div>
                <p className="text-[0.75rem] text-muted mt-1">
                  Placeholders, not commercial figures. Replace before customer use.
                </p>
              </div>
              <div className="p-4 flex flex-col gap-3">
                {PARAM_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor={f.key} className="text-[0.75rem] font-bold">
                        {f.label}
                      </label>
                      {/* Rationale stays reachable without occupying the rail. */}
                      {f.help && (
                        <details className="relative shrink-0">
                          <summary
                            className="cursor-pointer list-none text-[0.625rem] font-bold text-accent border-2 border-accent px-1 leading-tight"
                            aria-label={`Why this value for ${f.label}`}
                          >
                            ?
                          </summary>
                          <div className="absolute right-0 top-full mt-1 z-20 w-[30ch] surface p-2.5 text-[0.6875rem] leading-relaxed font-normal">
                            {f.help}
                          </div>
                        </details>
                      )}
                    </div>
                    <input
                      id={f.key}
                      className="field field-num"
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
                    The model is unit agnostic. This labels the figures and does not
                    convert them, so enter the customer's costs in the currency you pick.
                  </p>
                  <select
                    id="currency"
                    className="field"
                    value={params.currency}
                    onChange={(e) => setParams((p) => ({ ...p, currency: e.target.value }))}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol}) {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* saved scenarios */}
            <div className="flex flex-col gap-2">
              <div className="eyebrow text-accent">Saved scenarios</div>
              <button
                onClick={saveScenario}
                className="tap-target border border-line-soft bg-surface px-3 py-2 text-[0.8125rem] hover:bg-accent-soft text-left"
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
            <div className="flex flex-col gap-2">
              <div className="eyebrow text-accent">Batch workbook</div>

              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />

              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className={`w-full border border-dashed px-4 py-6 text-center transition-colors ${
                  dragging
                    ? 'border-accent bg-accent-soft'
                    : uploadError
                      ? 'border-warn bg-warn-soft'
                      : 'border-line-soft bg-surface hover:bg-accent-soft/40'
                } ${busy ? 'opacity-60' : ''}`}
              >
                <span className="block text-[0.875rem] font-medium">
                  {busy ? 'Reading workbook' : 'Choose a workbook, or drop one here'}
                </span>
                <span className="block text-[0.75rem] text-muted mt-1">
                  .xlsx, one row per site. Scored with the identical engine.
                </span>
              </button>

              {uploadError && (
                <div className="border border-warn bg-warn-soft px-3 py-2">
                  <div className="eyebrow text-warn mb-1">Could not read that file</div>
                  <p className="text-[0.75rem] whitespace-pre-wrap">{uploadError}</p>
                </div>
              )}

              <div className="flex items-baseline justify-between gap-2 text-[0.75rem]">
                <span className="text-muted">
                  Source: <span className="text-ink font-medium">{sourceName}</span>{' '}
                  ({scored.length} row{scored.length === 1 ? '' : 's'})
                </span>
                {sourceName !== 'Bundled sample portfolio' && (
                  <button
                    onClick={resetPortfolio}
                    className="text-accent underline underline-offset-2 shrink-0"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* canvas */}
        <main
          className={`overflow-y-auto thin-scroll lg:max-h-[calc(100vh-61px)] print-stack ${
            pane === 'results' ? '' : 'max-lg:hidden'
          }`}
        >
          <div className="p-5 flex flex-col gap-4 print-compact">{canvas}</div>

          {/* section navigator */}
          {!documentView && (
            <nav className="no-print sticky bottom-0 bg-ground border-t border-line px-5 py-3 flex gap-2 overflow-x-auto">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`btn shrink-0 text-left min-w-[8.5rem] ${
                    section === s.id ? 'btn-on' : ''
                  }`}
                >
                  <div className="eyebrow text-muted">{s.n}</div>
                  <div className="text-[0.75rem] font-bold mt-1">{s.label}</div>
                </button>
              ))}
            </nav>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------- footer */}
      {/*
        The scope limitation is the product, so it stays permanently on screen,
        but as one scannable line. The full statement sits one click away rather
        than as a paragraph nobody reads in a live meeting.
      */}
      <footer className="no-print border-t border-line bg-surface px-5 py-2.5">
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-[0.6875rem]">
            <span className="eyebrow text-warn">Scope</span>
            <span className="text-muted">
              Labour displacement only. Defaults are placeholders.
            </span>
            <span className="text-accent underline underline-offset-2 ml-auto shrink-0">
              Full statement
            </span>
          </summary>
          <div className="mt-2 pt-2 border-t border-line-soft grid gap-2 sm:grid-cols-3 text-[0.6875rem] text-muted leading-relaxed">
            <p>
              <span className="font-bold text-ink">Excluded value pools.</span> Avoided scaffolding
              and rope access, avoided shutdown windows, compliance penalty exposure, unplanned
              downtime. Each is typically larger than the labour line at industrial scale, so read
              this as a floor.
            </p>
            <p>
              <span className="font-bold text-ink">Placeholder economics.</span> Every
              autonomous-side default is a placeholder, not a commercial quote and not an industry
              benchmark. Replace before customer use.
            </p>
            <p>
              <span className="font-bold text-ink">Key uncertainties.</span> Utilisation and
              addressable share are the two assumptions neither priced nor supplied by the customer.
              They decide the case, and Section 04 shows the range.
            </p>
          </div>
        </details>
      </footer>

      {dragging && (
        <div className="fixed inset-0 z-30 bg-accent-soft/90 border-4 border-accent flex items-center justify-center pointer-events-none">
          <p className="text-[1.125rem] font-semibold">Drop the workbook to score it</p>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-40 border border-ink bg-surface px-4 py-3 text-[0.8125rem]"
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
      <td className="px-2 py-1 border-b border-line-soft text-muted">{label}</td>
      <td className="px-2 py-1 border-b border-line-soft text-right tnum">{fa}</td>
      <td className="px-2 py-1 border-b border-line-soft text-right tnum">{fb}</td>
    </tr>
  );

  const pct = (r: typeof ra) =>
    r.status === 'ok' ? `${(r.current.costRatio * 100).toFixed(1)}%` : 'incomplete';
  const money = (r: typeof ra, k: 'saving' | 'autoCost') =>
    r.status === 'ok' ? r.current[k].toLocaleString('en-US', { maximumFractionDigits: 0 }) : '';
  const count = (r: typeof ra, k: 'docks' | 'operators') =>
    r.status === 'ok' ? String(r.current[k]) : '';

  return (
    <div className="border border-line-soft bg-surface overflow-x-auto">
      <table className="w-full text-[0.75rem] border-collapse">
        <thead>
          <tr className="bg-accent-soft">
            <th className="text-left px-2 py-1.5 border-b border-line-soft font-semibold">Line</th>
            <th className="text-right px-2 py-1.5 border-b border-line-soft font-semibold">{a.name}</th>
            <th className="text-right px-2 py-1.5 border-b border-line-soft font-semibold">{b.name}</th>
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
