import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import {
  Activity, AlertCircle, ArrowRight, Check, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardCheck, FileClock, FileText, Filter, Layers3, LoaderCircle,
  Pencil, Plus, RefreshCw, Shield, ShieldCheck, Trash2, X,
} from 'lucide-react';
import {
  useHealthCheck, useGetSummary, getGetSummaryQueryKey,
  useGetPortfolios, getGetPortfoliosQueryKey, useCreatePortfolio, useUpdatePortfolio, useDeletePortfolio,
  useGetTrusts, getGetTrustsQueryKey, useCreateTrust, useUpdateTrust, useDeleteTrust,
  useGetRules, getGetRulesQueryKey, useCreateRule, useUpdateRule, useDeleteRule,
  useGetHoldingDates, getGetHoldingDatesQueryKey, useGetHoldings, getGetHoldingsQueryKey,
  useUpdateHoldings, useGetReports, getGetReportsQueryKey, useRunReport,
} from '@workspace/api-client-react';
import type {
  ComplianceReport, ComplianceRule, Holding, Portfolio, RuleCondition, RuleGroup, RuleLimit, Trust,
} from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

ModuleRegistry.registerModules([AllCommunityModule]);
const queryClient = new QueryClient();

const metricLabels: Record<RuleLimit['metric'], string> = {
  total_bv: 'Total book value', total_mv: 'Total market value', actual_pct: 'Actual percentage',
};
const fields = [
  ['naic_designation_code', 'NAIC designation'], ['core_level1_code', 'Core level 1'],
  ['core_level2_code', 'Core level 2'], ['general_ledger_group', 'General ledger group'],
  ['cusip', 'CUSIP'], ['issuer', 'Issuer'], ['asset_class', 'Asset class'],
  ['bv_accrued', 'Book value'], ['mv_accrued', 'Market value'],
] as const;
const comparators = ['EQ', 'NE', 'LIKE', 'NOT_LIKE', 'LT', 'LTE', 'GT', 'GTE'] as const;

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider>
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster />
  </TooltipProvider></QueryClientProvider>;
}

function Router() {
  const [path] = useLocation();
  return <RoutedErrorBoundary resetKey={path}><Shell><Switch>
    <Route path="/" component={Overview} />
    <Route path="/trusts" component={TrustsPage} />
    <Route path="/rules" component={RulesPage} />
    <Route path="/holdings" component={HoldingsPage} />
    <Route component={NotFound} />
  </Switch></Shell></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  return <ErrorBoundary resetKey={resetKey}>{children}</ErrorBoundary>;
}

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const nav = [
    { href: '/', title: 'Overview', icon: Activity },
    { href: '/trusts', title: 'Trusts & portfolios', icon: Layers3 },
    { href: '/rules', title: 'Compliance rules', icon: ShieldCheck },
    { href: '/holdings', title: 'Holdings & reports', icon: ClipboardCheck },
  ];
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand-lockup" data-testid="link-brand-home">
        <span className="brand-mark"><Shield size={20} strokeWidth={1.7} /></span>
        <span><strong>Trust</strong><small>COMPLIANCE OFFICE</small></span>
      </Link>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav">{nav.map(({ href, title, icon: Icon }) =>
        <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} data-testid={`link-nav-${title.toLowerCase().replaceAll(' ', '-')}`}>
          <Icon size={17} strokeWidth={1.8} /><span>{title}</span>{path === href && <span className="nav-indicator" />}
        </Link>)}</nav>
      <div className="sidebar-foot">
        <div className="status-dot" />
        <div><span>Reporting services</span><small>Connected</small></div>
        <span className="connected-pulse" />
      </div>
      <div className="sidebar-version mono">INTERNAL · 01.04</div>
    </aside>
    <main className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><span>Operations</span><span className="crumb-slash">/</span><strong>{nav.find(n => n.href === path)?.title ?? 'Page'}</strong></div>
        <div className="topbar-right"><span className="topbar-date mono">{new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date())}</span><span className="user-chip"><span className="user-initial">TC</span><span>Trust operations</span><ChevronDown size={14} /></span></div>
      </header>
      <div className="content-wrap">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{detail}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Button({ children, variant = 'primary', onClick, disabled, type = 'button', testId }: { children: ReactNode; variant?: 'primary' | 'outline' | 'quiet' | 'danger'; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; testId: string }) {
  return <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled} data-testid={testId}>{children}</button>;
}
function IconButton({ label, onClick, danger = false, testId }: { label: string; onClick: () => void; danger?: boolean; testId: string }) {
  return <button className={`icon-button ${danger ? 'danger' : ''}`} onClick={onClick} aria-label={label} title={label} data-testid={testId}>{danger ? <Trash2 size={15} /> : <Pencil size={15} />}</button>;
}
function LoadingBlock({ label = 'Loading records' }: { label?: string }) {
  return <div className="loading-block"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /><span>{label}</span></div>;
}
function ErrorState({ retry, message = 'We couldn’t retrieve this information.' }: { retry: () => void; message?: string }) {
  return <div className="empty-state error-state"><AlertCircle size={22} /><strong>Connection interrupted</strong><span>{message}</span><Button variant="outline" onClick={retry} testId="button-retry"><RefreshCw size={14} /> Try again</Button></div>;
}
function EmptyState({ icon: Icon = FileText, title, text }: { icon?: typeof FileText; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><strong>{title}</strong><span>{text}</span></div>;
}
function MutationError({ show }: { show: boolean }) {
  return show ? <div className="mutation-error" role="alert"><AlertCircle size={15} /> The change could not be saved. Review the record and try again.</div> : null;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section>; }
function PanelHeading({ title, description, right }: { title: string; description?: string; right?: ReactNode }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{right}</div>;
}
function fmtDate(date?: string) {
  if (!date) return '—';
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? date : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(parsed);
}
function fmtDateTime(date?: string) {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? date : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(parsed);
}
function amount(value?: number, currency = true) {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: currency ? 'currency' : 'decimal', currency: 'USD', maximumFractionDigits: currency ? 0 : 2 }).format(value);
}
function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status.toLowerCase()}`}><span />{status}</span>;
}
function useInvalidate() {
  const qc = useQueryClient();
  return (keys: readonly unknown[][]) => keys.forEach(queryKey => void qc.invalidateQueries({ queryKey }));
}

function Overview() {
  const summary = useGetSummary();
  const health = useHealthCheck();
  const reports = useGetReports({}, { query: { queryKey: getGetReportsQueryKey({}) } });
  const trustCount = summary.data?.trustCount;
  const latest = summary.data?.latestReport;
  const stats = [
    { label: 'TRUSTS UNDER REVIEW', value: trustCount, note: 'Registered trust entities', icon: Layers3, shade: 'green' },
    { label: 'PORTFOLIOS', value: summary.data?.portfolioCount, note: 'Available assignments', icon: FileText, shade: 'amber' },
    { label: 'ACTIVE RULES', value: summary.data?.ruleCount, note: 'Compliance criteria', icon: ShieldCheck, shade: 'blue' },
  ];
  return <div className="page-enter">
    <PageHeading eyebrow="COMPLIANCE OPERATIONS" title="Good morning." detail="A clear view of trust coverage, rule activity, and the latest review." action={<span className={`service-label ${['ok', 'up', 'healthy'].includes(health.data?.status?.toLowerCase() ?? '') ? 'online' : ''}`}><i />{health.isLoading ? 'Checking services' : health.isError ? 'Service status unavailable' : `Services ${health.data?.status ?? 'unknown'}`}</span>} />
    <div className="stat-grid">{stats.map(({ label, value, note, icon: Icon, shade }, index) => <article className={`stat-card stat-${shade}`} key={label} style={{ animationDelay: `${index * 70}ms` }} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="stat-card-top"><span>{label}</span><Icon size={17} /></div>
      {summary.isLoading ? <div className="skeleton-line stat-skeleton" /> : <strong className="stat-number mono">{value ?? '—'}</strong>}
      <span className="stat-note">{note}</span>
    </article>)}</div>
    {summary.isError && <ErrorState retry={() => void summary.refetch()} />}
    <div className="overview-grid">
      <Panel className="latest-panel"><PanelHeading title="Latest report" description="Most recent completed compliance run" right={<Link href="/holdings" className="text-link" data-testid="link-open-reports">Open reports <ArrowRight size={14} /></Link>} />
        {summary.isLoading ? <LoadingBlock /> : latest ? <div className="report-feature">
          <div className="report-feature-head"><div className="report-date-block"><span className="overline">AS OF</span><strong>{fmtDate(latest.asOfDate)}</strong></div><div className="report-stamp"><CheckCircle2 size={17} /><span>Report #{latest.id}</span></div></div>
          <div className="report-trust">{latest.trustName}<span className="mono">TRUST ID {latest.trustId}</span></div>
          <div className="report-result-numbers"><div><strong>{latest.totalHoldingCount.toLocaleString()}</strong><span>holdings assessed</span></div><div className="pass-text"><strong>{latest.passCount}</strong><span>passed</span></div><div className={latest.failCount ? 'fail-text' : ''}><strong>{latest.failCount}</strong><span>failed</span></div></div>
          <div className="report-runline"><FileClock size={14} /> Run {fmtDateTime(latest.runAt)}</div>
        </div> : <EmptyState icon={ClipboardCheck} title="No report runs yet" text="Run a compliance review from Holdings & reports to see the result here." />}
      </Panel>
      <Panel className="service-panel"><PanelHeading title="Review readiness" description="Current workspace health" />
        <div className="readiness-list"><div><span className="readiness-icon green"><Check size={15} /></span><div><strong>Reporting service</strong><small>{health.isError ? 'Unable to confirm status' : health.data?.status ? `Status: ${health.data.status}` : 'Checking connection'}</small></div><span className={`readiness-state ${health.isError ? 'warn' : ''}`}>{health.isLoading ? 'Checking' : health.isError ? 'Review' : 'Ready'}</span></div>
          <div><span className="readiness-icon amber"><Layers3 size={15} /></span><div><strong>Trust coverage</strong><small>{trustCount === undefined ? 'Awaiting summary' : `${trustCount} trust${trustCount === 1 ? '' : 's'} registered`}</small></div><ArrowRight size={15} className="readiness-arrow" /></div>
          <div><span className="readiness-icon blue"><ShieldCheck size={15} /></span><div><strong>Rule catalogue</strong><small>{summary.data?.ruleCount === undefined ? 'Awaiting summary' : `${summary.data.ruleCount} rule${summary.data.ruleCount === 1 ? '' : 's'} available`}</small></div><ArrowRight size={15} className="readiness-arrow" /></div></div>
      </Panel>
    </div>
    <Panel className="activity-panel"><PanelHeading title="Recent report activity" description="Audit trail of the latest compliance runs" right={<Link href="/holdings" className="text-link" data-testid="link-view-all-reports">View workspace <ArrowRight size={14} /></Link>} />
      {reports.isLoading ? <LoadingBlock label="Loading report activity" /> : reports.isError ? <ErrorState retry={() => void reports.refetch()} /> : reports.data?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>TRUST</th><th>AS-OF DATE</th><th>RUN TIME</th><th>HOLDINGS</th><th>OUTCOME</th><th></th></tr></thead><tbody>{reports.data.slice(0, 6).map(report => <tr key={report.id} data-testid={`row-report-${report.id}`}><td><strong>{report.trustName}</strong><small className="mono">TRUST {report.trustId} · REPORT {report.id}</small></td><td className="mono">{fmtDate(report.asOfDate)}</td><td>{fmtDateTime(report.runAt)}</td><td className="mono">{report.totalHoldingCount.toLocaleString()}</td><td><span className={report.failCount ? 'outcome-fail' : 'outcome-pass'}>{report.failCount ? `${report.failCount} failed` : 'All passed'}</span><small>{report.passCount} passing rules</small></td><td><Link href="/holdings" className="row-arrow" aria-label={`Open report ${report.id}`} data-testid={`link-report-${report.id}`}><ArrowRight size={16} /></Link></td></tr>)}</tbody></table></div> : <EmptyState icon={FileClock} title="Activity starts with a report" text="Run your first review to create a dependable audit trail." />}
    </Panel>
  </div>;
}

function Dialog({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header className="dialog-header"><div><span className="eyebrow">WORKSPACE RECORD</span><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X size={17} /></button></header>{children}
  </section></div>;
}
function TextField({ label, name, value, onChange, required = true, placeholder }: { label: string; name: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  return <label className="field"><span>{label}</span><input name={name} value={value} onChange={event => onChange(event.target.value)} required={required} placeholder={placeholder} data-testid={`input-${name}`} /></label>;
}
function TrustsPage() {
  const qc = useQueryClient();
  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: getGetTrustsQueryKey() }), qc.invalidateQueries({ queryKey: getGetPortfoliosQueryKey() }), qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() })]);
  const trusts = useGetTrusts();
  const portfolios = useGetPortfolios();
  const createTrust = useCreateTrust();
  const updateTrust = useUpdateTrust();
  const deleteTrust = useDeleteTrust();
  const createPortfolio = useCreatePortfolio();
  const updatePortfolio = useUpdatePortfolio();
  const deletePortfolio = useDeletePortfolio();
  const [dialog, setDialog] = useState<'trust' | 'portfolio' | null>(null);
  const [editingTrust, setEditingTrust] = useState<Trust | null>(null);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [trustForm, setTrustForm] = useState({ name: '', code: '', portfolioId: '' });
  const [portfolioForm, setPortfolioForm] = useState({ name: '', code: '' });
  const pending = createTrust.isPending || updateTrust.isPending || deleteTrust.isPending || createPortfolio.isPending || updatePortfolio.isPending || deletePortfolio.isPending;
  const openTrust = (trust?: Trust) => { setEditingTrust(trust ?? null); setTrustForm({ name: trust?.name ?? '', code: trust?.code ?? '', portfolioId: trust?.portfolioId ? String(trust.portfolioId) : '' }); setDialog('trust'); };
  const openPortfolio = (portfolio?: Portfolio) => { setEditingPortfolio(portfolio ?? null); setPortfolioForm({ name: portfolio?.name ?? '', code: portfolio?.code ?? '' }); setDialog('portfolio'); };
  const submitTrust = (event: FormEvent) => {
    event.preventDefault();
    const payload = { name: trustForm.name.trim(), code: trustForm.code.trim(), portfolioId: trustForm.portfolioId ? Number(trustForm.portfolioId) : null };
    const done = () => { void invalidate(); setDialog(null); };
    if (editingTrust) updateTrust.mutate({ trustId: editingTrust.id, data: payload }, { onSuccess: done });
    else createTrust.mutate({ data: payload }, { onSuccess: done });
  };
  const submitPortfolio = (event: FormEvent) => {
    event.preventDefault();
    const payload = { name: portfolioForm.name.trim(), code: portfolioForm.code.trim() };
    const done = () => { void invalidate(); setDialog(null); };
    if (editingPortfolio) updatePortfolio.mutate({ portfolioId: editingPortfolio.id, data: payload }, { onSuccess: done });
    else createPortfolio.mutate({ data: payload }, { onSuccess: done });
  };
  const removeTrust = (trust: Trust) => { if (window.confirm(`Delete trust “${trust.name}”?`)) deleteTrust.mutate({ trustId: trust.id }, { onSuccess: () => void invalidate() }); };
  const removePortfolio = (portfolio: Portfolio) => { if (portfolio.trustId) return; if (window.confirm(`Delete portfolio “${portfolio.name}”?`)) deletePortfolio.mutate({ portfolioId: portfolio.id }, { onSuccess: () => void invalidate() }); };
  const availablePortfolio = (id: number | null | undefined) => (portfolios.data ?? []).filter(p => !p.trustId || p.trustId === editingTrust?.id || p.id === id);
  return <div className="page-enter">
    <PageHeading eyebrow="ENTITY REGISTER" title="Trusts & portfolios" detail="Maintain trust records and their one-to-one portfolio assignments." action={<div className="button-row"><Button variant="outline" onClick={() => openPortfolio()} testId="button-add-portfolio"><Plus size={15} /> Portfolio</Button><Button onClick={() => openTrust()} testId="button-add-trust"><Plus size={15} /> New trust</Button></div>} />
    <div className="assignment-note"><span className="note-mark"><CircleHelp size={16} /></span><span>Each portfolio can be assigned to one trust. Unassigned portfolios remain available for a future assignment.</span><span className="assignment-count mono">{portfolios.data?.filter(item => item.trustId).length ?? '—'} ASSIGNED</span></div>
    <Panel className="register-panel"><PanelHeading title="Trust register" description="Trust identity and assigned portfolio" right={<span className="count-tag mono">{trusts.data?.length ?? '—'} RECORDS</span>} />
      {trusts.isLoading || portfolios.isLoading ? <LoadingBlock /> : trusts.isError || portfolios.isError ? <ErrorState retry={() => { void trusts.refetch(); void portfolios.refetch(); }} /> : trusts.data?.length ? <div className="table-scroll"><table className="data-table trust-table"><thead><tr><th>TRUST</th><th>TRUST CODE</th><th>PORTFOLIO ASSIGNMENT</th><th>PORTFOLIO CODE</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{trusts.data.map(trust => <tr key={trust.id} data-testid={`row-trust-${trust.id}`}><td><strong>{trust.name}</strong><small className="mono">ENTITY ID {trust.id}</small></td><td className="mono code-cell">{trust.code}</td><td>{trust.portfolioName ? <span className="assignment-value"><span className="assignment-led" />{trust.portfolioName}</span> : <span className="unassigned">Unassigned</span>}</td><td className="mono">{portfolios.data?.find(p => p.id === trust.portfolioId)?.code ?? '—'}</td><td className="align-right"><div className="row-actions"><IconButton label="Edit trust" testId={`button-edit-trust-${trust.id}`} onClick={() => openTrust(trust)} /><IconButton label="Delete trust" danger testId={`button-delete-trust-${trust.id}`} onClick={() => removeTrust(trust)} /></div></td></tr>)}</tbody></table></div> : <EmptyState icon={Layers3} title="No trusts registered" text="Create the first trust record to begin assigning compliance coverage." />}
    </Panel>
    <Panel className="portfolio-panel"><PanelHeading title="Portfolio register" description="Available portfolios and current trust ownership" right={<span className="count-tag mono">{portfolios.data?.length ?? '—'} RECORDS</span>} />
      {portfolios.isLoading ? <LoadingBlock /> : portfolios.isError ? <ErrorState retry={() => void portfolios.refetch()} /> : portfolios.data?.length ? <div className="portfolio-list">{portfolios.data.map(portfolio => <div className="portfolio-row" key={portfolio.id} data-testid={`row-portfolio-${portfolio.id}`}><div className="portfolio-avatar"><Layers3 size={17} /></div><div className="portfolio-main"><strong>{portfolio.name}</strong><span className="mono">{portfolio.code} <i>·</i> ID {portfolio.id}</span></div><div className={`ownership ${portfolio.trustId ? 'owned' : ''}`}><span className="ownership-dot" />{portfolio.trustName ? `Assigned to ${portfolio.trustName}` : 'Available'}</div><div className="row-actions"><IconButton label="Edit portfolio" testId={`button-edit-portfolio-${portfolio.id}`} onClick={() => openPortfolio(portfolio)} /><IconButton label="Delete portfolio" danger testId={`button-delete-portfolio-${portfolio.id}`} onClick={() => removePortfolio(portfolio)} /></div></div>)}</div> : <EmptyState icon={FileText} title="No portfolios available" text="Add a portfolio before assigning it to a trust." />}
    </Panel>
    {dialog === 'trust' && <Dialog title={editingTrust ? 'Edit trust record' : 'Create trust'} description="Trust identity and portfolio assignment." onClose={() => setDialog(null)}><form className="dialog-form" onSubmit={submitTrust}>
      <TextField label="Trust name" name="trust-name" value={trustForm.name} onChange={name => setTrustForm(v => ({ ...v, name }))} placeholder="e.g. Northshore Life Insurance Trust" />
      <TextField label="Trust code" name="trust-code" value={trustForm.code} onChange={code => setTrustForm(v => ({ ...v, code }))} placeholder="e.g. NSL-01" />
      <label className="field"><span>Assigned portfolio <small>Optional · one-to-one</small></span><select value={trustForm.portfolioId} onChange={event => setTrustForm(v => ({ ...v, portfolioId: event.target.value }))} data-testid="select-trust-portfolio"><option value="">No portfolio assigned</option>{availablePortfolio(trusts.data?.find(t => t.id === editingTrust?.id)?.portfolioId).map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}</select></label>
      <MutationError show={createTrust.isError || updateTrust.isError} />
      <div className="dialog-actions"><Button variant="outline" onClick={() => setDialog(null)} testId="button-cancel-trust">Cancel</Button><Button type="submit" disabled={pending} testId="button-save-trust">{pending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{editingTrust ? 'Save changes' : 'Create trust'}</Button></div>
    </form></Dialog>}
    {dialog === 'portfolio' && <Dialog title={editingPortfolio ? 'Edit portfolio' : 'Create portfolio'} description={editingPortfolio?.trustId ? `Assigned to ${editingPortfolio.trustName}; assignment is managed from the trust record.` : 'Portfolio records can be assigned to one trust.'} onClose={() => setDialog(null)}><form className="dialog-form" onSubmit={submitPortfolio}>
      <TextField label="Portfolio name" name="portfolio-name" value={portfolioForm.name} onChange={name => setPortfolioForm(v => ({ ...v, name }))} placeholder="e.g. General account" />
      <TextField label="Portfolio code" name="portfolio-code" value={portfolioForm.code} onChange={code => setPortfolioForm(v => ({ ...v, code }))} placeholder="e.g. GA-204" />
      <MutationError show={createPortfolio.isError || updatePortfolio.isError} />
      <div className="dialog-actions"><Button variant="outline" onClick={() => setDialog(null)} testId="button-cancel-portfolio">Cancel</Button><Button type="submit" disabled={pending} testId="button-save-portfolio">{pending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{editingPortfolio ? 'Save changes' : 'Create portfolio'}</Button></div>
    </form></Dialog>}
  </div>;
}

const emptyCondition = (): RuleCondition => ({ nodeType: 'condition', field: 'asset_class', comparator: 'EQ', value: '' });
const emptyGroup = (): RuleGroup => ({ nodeType: 'group', operator: 'AND', children: [emptyCondition()] });
function patchNodeAt(group: RuleGroup, path: number[], next: RuleGroup | RuleCondition | null): RuleGroup {
  if (path.length === 0) return next?.nodeType === 'group' ? next : group;
  const copy: RuleGroup = { ...group, children: [...group.children] };
  if (path.length === 1) {
    if (next) copy.children[path[0]] = next;
    else if (copy.children.length > 1) copy.children.splice(path[0], 1);
    return copy;
  }
  const child = copy.children[path[0]];
  if (child.nodeType === 'group') copy.children[path[0]] = patchNodeAt(child, path.slice(1), next);
  return copy;
}
function CriteriaNode({ node, path, root, onChange, depth = 0 }: { node: RuleGroup | RuleCondition; path: number[]; root: RuleGroup; onChange: (value: RuleGroup) => void; depth?: number }) {
  const update = (next: RuleGroup | RuleCondition | null) => onChange(patchNodeAt(root, path, next) as RuleGroup);
  if (node.nodeType === 'group') return <div className={`criteria-group ${depth ? 'nested-group' : 'root-group'}`}>
    <div className="criteria-group-head"><div className="logic-select-wrap"><span className="logic-bracket">{depth ? '└' : '⌘'}</span><select aria-label="Group operator" value={node.operator} onChange={event => update({ ...node, operator: event.target.value as 'AND' | 'OR' })} data-testid={`select-group-operator-${path.join('-') || 'root'}`}><option value="AND">Match all · AND</option><option value="OR">Match any · OR</option></select></div><span className="logic-description">{node.children.length} clause{node.children.length === 1 ? '' : 's'}</span></div>
    <div className="criteria-children">{node.children.map((child, index) => <div key={index} className="criteria-child"><CriteriaNode node={child} path={[...path, index]} root={root} onChange={onChange} depth={depth + 1} /><button type="button" className="remove-clause" aria-label="Remove clause" disabled={node.children.length <= 1} onClick={() => updateFromPath(root, [...path, index], null, onChange)} data-testid={`button-remove-clause-${[...path, index].join('-')}`}><X size={14} /></button></div>)}</div>
    <div className="criteria-add-row"><button type="button" onClick={() => update({ ...node, children: [...node.children, emptyCondition()] })} data-testid={`button-add-condition-${path.join('-') || 'root'}`}><Plus size={13} /> Condition</button><button type="button" onClick={() => update({ ...node, children: [...node.children, emptyGroup()] })} data-testid={`button-add-group-${path.join('-') || 'root'}`}><Plus size={13} /> Nested group</button></div>
  </div>;
  return <div className="condition-row">
    <select value={node.field} onChange={event => { const field = event.target.value as RuleCondition['field']; const numeric = ['bv_accrued', 'mv_accrued'].includes(field); update({ ...node, field, comparator: numeric && ['LIKE', 'NOT_LIKE'].includes(node.comparator) ? 'EQ' : node.comparator, value: numeric ? (Number(node.value) || 0) : String(node.value) }); }} aria-label="Condition field" data-testid={`select-condition-field-${path.join('-')}`}>{fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <select value={node.comparator} onChange={event => update({ ...node, comparator: event.target.value as RuleCondition['comparator'] })} aria-label="Condition comparator" data-testid={`select-condition-comparator-${path.join('-')}`}>{comparators.filter(value => !(['bv_accrued', 'mv_accrued'].includes(node.field) && ['LIKE', 'NOT_LIKE'].includes(value))).map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select>
    <input value={String(node.value)} onChange={event => update({ ...node, value: ['bv_accrued', 'mv_accrued'].includes(node.field) ? Number(event.target.value) : event.target.value })} type={['bv_accrued', 'mv_accrued'].includes(node.field) ? 'number' : 'text'} aria-label="Condition value" placeholder="Enter value" data-testid={`input-condition-value-${path.join('-')}`} />
  </div>;
}
function updateFromPath(root: RuleGroup, path: number[], next: RuleGroup | RuleCondition | null, onChange: (value: RuleGroup) => void) {
  onChange(patchNodeAt(root, path, next));
}
function summarizeNode(node: RuleGroup | RuleCondition): string {
  if (node.nodeType === 'condition') return `${fields.find(([key]) => key === node.field)?.[1] ?? node.field} ${node.comparator} “${node.value}”`;
  return `(${node.children.map(summarizeNode).join(` ${node.operator} `)})`;
}
function RulesPage() {
  const qc = useQueryClient();
  const trusts = useGetTrusts();
  const [filterTrust, setFilterTrust] = useState('');
  const params = useMemo(() => filterTrust ? { trustId: Number(filterTrust) } : {}, [filterTrust]);
  const rules = useGetRules(params, { query: { queryKey: getGetRulesQueryKey(params) } });
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const [editing, setEditing] = useState<ComplianceRule | null>(null);
  const [form, setForm] = useState({ name: '', trustId: '', enabled: true, aggregationCriteria: emptyGroup(), metric: 'total_bv' as RuleLimit['metric'], comparator: 'LTE' as RuleLimit['comparator'], value: '0' });
  const [editorOpen, setEditorOpen] = useState(false);
  const busy = createRule.isPending || updateRule.isPending;
  const resetForm = (rule?: ComplianceRule) => {
    setEditing(rule ?? null);
    setForm(rule ? { name: rule.name, trustId: rule.trustId ? String(rule.trustId) : '', enabled: rule.enabled, aggregationCriteria: rule.aggregationCriteria, metric: rule.limit.metric, comparator: rule.limit.comparator, value: String(rule.limit.value) } : { name: '', trustId: '', enabled: true, aggregationCriteria: emptyGroup(), metric: 'total_bv', comparator: 'LTE', value: '0' });
    setEditorOpen(true);
  };
  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: getGetRulesQueryKey() }), qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() })]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const data = { name: form.name.trim(), trustId: form.trustId ? Number(form.trustId) : null, enabled: form.enabled, aggregationCriteria: form.aggregationCriteria, limit: { metric: form.metric, comparator: form.comparator, value: Number(form.value) } };
    const done = () => { void invalidate(); setEditorOpen(false); };
    if (editing) updateRule.mutate({ ruleId: editing.id, data }, { onSuccess: done });
    else createRule.mutate({ data }, { onSuccess: done });
  };
  const remove = (rule: ComplianceRule) => { if (window.confirm(`Delete compliance rule “${rule.name}”?`)) deleteRule.mutate({ ruleId: rule.id }, { onSuccess: () => void invalidate() }); };
  return <div className="page-enter">
    <PageHeading eyebrow="CONTROL LIBRARY" title="Compliance rules" detail="Express review logic as auditable groups, conditions, and explicit limits." action={<Button onClick={() => resetForm()} testId="button-create-rule"><Plus size={15} /> New rule</Button>} />
    <div className="filter-bar"><div className="filter-leading"><Filter size={15} /><span>Scope rules</span></div><select value={filterTrust} onChange={event => setFilterTrust(event.target.value)} aria-label="Filter rules by trust" data-testid="select-rule-trust-filter"><option value="">All trusts</option>{(trusts.data ?? []).map(trust => <option key={trust.id} value={trust.id}>{trust.name}</option>)}</select><span className="filter-note">Rules with no trust scope apply across the register.</span><span className="count-tag mono">{rules.data?.length ?? '—'} RULES</span></div>
    <div className="rules-list">{rules.isLoading ? <Panel><LoadingBlock label="Loading compliance rules" /></Panel> : rules.isError ? <Panel><ErrorState retry={() => void rules.refetch()} /></Panel> : rules.data?.length ? rules.data.map(rule => <RuleCard rule={rule} key={rule.id} edit={() => resetForm(rule)} remove={() => remove(rule)} />) : <Panel><EmptyState icon={ShieldCheck} title="No rules in this scope" text="Create a compliance rule to define which holdings are assessed and the limit to apply." /></Panel>}</div>
    {editorOpen && <Dialog title={editing ? 'Edit compliance rule' : 'Create compliance rule'} description="Define the population logic and limit used to evaluate holdings." onClose={() => setEditorOpen(false)}><form className="dialog-form rule-form" onSubmit={submit}>
      <TextField label="Rule name" name="rule-name" value={form.name} onChange={name => setForm(v => ({ ...v, name }))} placeholder="e.g. Below investment grade concentration" />
      <label className="field"><span>Trust scope</span><select value={form.trustId} onChange={event => setForm(v => ({ ...v, trustId: event.target.value }))} data-testid="select-rule-trust"><option value="">All trusts</option>{(trusts.data ?? []).map(trust => <option key={trust.id} value={trust.id}>{trust.name} · {trust.code}</option>)}</select></label>
      <div className="criteria-section"><div className="criteria-title"><span>01</span><div><strong>Holding selection logic</strong><small>One top-level group · nested AND / OR groups supported</small></div></div><CriteriaNode node={form.aggregationCriteria} path={[]} root={form.aggregationCriteria} onChange={aggregationCriteria => setForm(v => ({ ...v, aggregationCriteria }))} /></div>
      <div className="criteria-section limit-section"><div className="criteria-title"><span>02</span><div><strong>Aggregation limit</strong><small>Applied to the selected holdings</small></div></div><div className="limit-grid"><label className="field"><span>Metric</span><select value={form.metric} onChange={event => setForm(v => ({ ...v, metric: event.target.value as RuleLimit['metric'] }))} data-testid="select-rule-metric">{Object.entries(metricLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="field"><span>Comparator</span><select value={form.comparator} onChange={event => setForm(v => ({ ...v, comparator: event.target.value as RuleLimit['comparator'] }))} data-testid="select-rule-limit-comparator">{['EQ', 'NE', 'LT', 'LTE', 'GT', 'GTE'].map(value => <option key={value}>{value}</option>)}</select></label><TextField label="Limit value" name="rule-limit-value" value={form.value} onChange={value => setForm(v => ({ ...v, value }))} /></div></div>
      <label className="toggle-line"><input type="checkbox" checked={form.enabled} onChange={event => setForm(v => ({ ...v, enabled: event.target.checked }))} data-testid="checkbox-rule-enabled" /><span className="toggle-visual" /><span><strong>Rule enabled</strong><small>Enabled rules are included in report runs.</small></span></label>
      <MutationError show={createRule.isError || updateRule.isError} />
      <div className="dialog-actions"><Button variant="outline" onClick={() => setEditorOpen(false)} testId="button-cancel-rule">Cancel</Button><Button type="submit" disabled={busy || !form.name.trim() || !form.aggregationCriteria.children.length || !Number.isFinite(Number(form.value))} testId="button-save-rule">{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{editing ? 'Save changes' : 'Create rule'}</Button></div>
    </form></Dialog>}
  </div>;
}
function RuleCard({ rule, edit, remove }: { rule: ComplianceRule; edit: () => void; remove: () => void }) {
  return <Panel className="rule-card"><div className="rule-card-top"><div className="rule-ident"><span className="rule-symbol"><ShieldCheck size={18} /></span><div><h3>{rule.name}</h3><span className="rule-meta"><span className="mono">RULE {rule.id}</span><i />{rule.trustName ?? 'All trusts'}<i />Created {fmtDate(rule.createdAt)}</span></div></div><div className="rule-actions"><span className={`enabled-label ${rule.enabled ? 'on' : ''}`}><i />{rule.enabled ? 'Enabled' : 'Disabled'}</span><IconButton label="Edit rule" onClick={edit} testId={`button-edit-rule-${rule.id}`} /><IconButton label="Delete rule" danger onClick={remove} testId={`button-delete-rule-${rule.id}`} /></div></div>
    <div className="rule-summary-row"><div className="rule-logic"><span className="overline">SELECTED HOLDINGS</span><code>{summarizeNode(rule.aggregationCriteria)}</code></div><div className="rule-limit-box"><span className="overline">LIMIT</span><strong>{metricLabels[rule.limit.metric]} <span>{rule.limit.comparator}</span> <b className="mono">{amount(rule.limit.value, rule.limit.metric !== 'actual_pct')}{rule.limit.metric === 'actual_pct' ? '%' : ''}</b></strong></div></div>
  </Panel>;
}

function HoldingsPage() {
  const qc = useQueryClient();
  const trusts = useGetTrusts();
  const [trustId, setTrustId] = useState('');
  const dateParams = useMemo(() => ({ trustId: Number(trustId) || 0 }), [trustId]);
  const dates = useGetHoldingDates(dateParams, { query: { enabled: !!trustId, queryKey: getGetHoldingDatesQueryKey(dateParams) } });
  const [asOfDate, setAsOfDate] = useState('');
  const holdingParams = useMemo(() => ({ trustId: Number(trustId) || 0, asOfDate }), [trustId, asOfDate]);
  const holdings = useGetHoldings(holdingParams, { query: { enabled: !!trustId && !!asOfDate, queryKey: getGetHoldingsQueryKey(holdingParams) } });
  const reportsParams = useMemo(() => trustId ? { trustId: Number(trustId) } : {}, [trustId]);
  const reports = useGetReports(reportsParams, { query: { queryKey: getGetReportsQueryKey(reportsParams) } });
  const updateHoldings = useUpdateHoldings();
  const runReport = useRunReport();
  const [rows, setRows] = useState<Holding[]>([]);
  const [saved, setSaved] = useState(true);
  const [currentReport, setCurrentReport] = useState<ComplianceReport | null>(null);
  const selectedTrust = trusts.data?.find(trust => String(trust.id) === trustId);
  useEffect(() => {
    if (trustId && dates.data?.length) {
      setAsOfDate(previous => dates.data!.includes(previous) ? previous : dates.data![0]);
    } else if (!trustId || (dates.data && !dates.data.length)) setAsOfDate('');
  }, [trustId, dates.data]);
  useEffect(() => {
    if (holdings.data) { setRows(holdings.data); setSaved(true); }
  }, [holdings.data]);
  const save = () => {
    updateHoldings.mutate({ data: { trustId: Number(trustId), asOfDate, holdings: rows.map(({ id, cusip, issuer, assetClass, naicDesignationCode, coreLevel1Code, coreLevel2Code, generalLedgerGroup, bvAccrued, mvAccrued }) => ({ id, cusip, issuer, assetClass, naicDesignationCode, coreLevel1Code, coreLevel2Code, generalLedgerGroup, bvAccrued, mvAccrued })) } }, { onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: getGetHoldingsQueryKey(holdingParams) }); } });
  };
  const run = () => runReport.mutate({ data: { trustId: Number(trustId), asOfDate } }, { onSuccess: report => { setCurrentReport(report); void qc.invalidateQueries({ queryKey: getGetReportsQueryKey(reportsParams) }); void qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() }); } });
  const columnDefs = useMemo<ColDef<Holding>[]>(() => [
    { field: 'cusip', headerName: 'CUSIP', width: 120, pinned: 'left' as const },
    { field: 'issuer', headerName: 'Issuer', minWidth: 190, flex: 1 },
    { field: 'assetClass', headerName: 'Asset class', width: 145 },
    { field: 'naicDesignationCode', headerName: 'NAIC', width: 100 },
    { field: 'coreLevel1Code', headerName: 'Core L1', width: 105 },
    { field: 'coreLevel2Code', headerName: 'Core L2', width: 105 },
    { field: 'generalLedgerGroup', headerName: 'GL group', width: 130 },
    { field: 'bvAccrued', headerName: 'Book value', width: 140, type: 'numericColumn', valueFormatter: (p: { value?: number }) => amount(p.value), cellClass: 'grid-number' },
    { field: 'mvAccrued', headerName: 'Market value', width: 145, type: 'numericColumn', valueFormatter: (p: { value?: number }) => amount(p.value), cellClass: 'grid-number' },
  ], []);
  const activeReport = currentReport ?? reports.data?.[0] ?? null;
  return <div className="page-enter">
    <PageHeading eyebrow="PORTFOLIO REVIEW" title="Holdings & reports" detail="Select the reporting context, maintain holdings, then run a traceable compliance review." />
    <Panel className="review-context"><div className="context-label"><span className="context-icon"><ClipboardCheck size={17} /></span><div><strong>Review context</strong><small>Trust and date determine the holdings and rules evaluated.</small></div></div><div className="context-controls">
      <label className="field"><span>Trust</span><select value={trustId} onChange={event => { setTrustId(event.target.value); setCurrentReport(null); }} data-testid="select-holdings-trust"><option value="">Select a trust</option>{(trusts.data ?? []).map(trust => <option key={trust.id} value={trust.id}>{trust.name} · {trust.code}</option>)}</select></label>
      <label className="field"><span>Available month-end date</span><select value={asOfDate} onChange={event => { setAsOfDate(event.target.value); setCurrentReport(null); }} disabled={!trustId || dates.isLoading || !dates.data?.length} data-testid="select-holdings-date"><option value="">{!trustId ? 'Select a trust first' : dates.isLoading ? 'Loading dates…' : 'Select a date'}</option>{(dates.data ?? []).map(date => <option value={date} key={date}>{fmtDate(date)}</option>)}</select></label>
      <div className="context-actions"><Button variant="outline" onClick={save} disabled={!trustId || !asOfDate || !rows.length || saved || updateHoldings.isPending} testId="button-save-holdings">{updateHoldings.isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{saved ? 'Saved' : 'Save edits'}</Button><Button onClick={run} disabled={!trustId || !asOfDate || runReport.isPending || !saved} testId="button-run-report">{runReport.isPending ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}{runReport.isPending ? 'Running review' : 'Run report'}</Button></div>
    </div>{selectedTrust && <div className="context-audit"><span>TRUST <b>{selectedTrust.name}</b></span><i /> <span>AS OF <b className="mono">{asOfDate ? fmtDate(asOfDate) : '—'}</b></span><i /> <span>ASSIGNMENT <b>{selectedTrust.portfolioName ?? 'No portfolio assigned'}</b></span></div>}</Panel>
    {dates.isError && trustId && <ErrorState retry={() => void dates.refetch()} message="Available reporting dates could not be loaded." />}
    {holdings.isError && <ErrorState retry={() => void holdings.refetch()} message="Holdings could not be loaded for this trust and date." />}
    <Panel className="holdings-panel"><PanelHeading title="Holdings register" description={trustId && asOfDate ? `${selectedTrust?.name ?? 'Selected trust'} · ${fmtDate(asOfDate)}` : 'Choose a trust and month-end date to load holdings.'} right={<div className="grid-toolbar">{holdings.data && <span className="count-tag mono">{rows.length.toLocaleString()} HOLDINGS</span>}<span className={`save-indicator ${saved ? '' : 'unsaved'}`}><i />{saved ? 'Changes saved' : 'Unsaved edits'}</span></div>} />
      {trusts.isLoading || (trustId && dates.isLoading) || (trustId && asOfDate && holdings.isLoading) ? <LoadingBlock label="Loading review data" /> : !trustId ? <EmptyState icon={ClipboardCheck} title="Choose the review context" text="Select a trust and available month-end date to inspect its holdings." /> : !asOfDate ? <EmptyState icon={FileClock} title="No month-end date selected" text={dates.data?.length ? 'Select one of the available month-end dates above.' : 'There are no available holdings dates for this trust.'} /> : rows.length ? <div className="grid-viewport"><AgGridReact rowData={rows} columnDefs={columnDefs} getRowId={params => String(params.data.id)} defaultColDef={{ editable: true, sortable: true, filter: true, resizable: true, cellDataType: false }} onCellValueChanged={() => setSaved(false)} animateRows={false} theme={themeQuartz.withParams({ backgroundColor: '#fffefa', foregroundColor: '#273342', headerBackgroundColor: '#f4f2ec', borderColor: '#e4e0d6', rowHoverColor: '#f4f7f3', fontFamily: 'DM Sans, sans-serif', fontSize: 12 })} rowHeight={39} headerHeight={38} /></div> : <EmptyState icon={FileText} title="No holdings for this date" text="No holdings were returned for the selected trust and reporting date." />}
    </Panel>
    {runReport.isError && <div className="inline-error"><AlertCircle size={16} /> Report could not be completed. Confirm the selected context and try again.</div>}
    {updateHoldings.isError && <div className="inline-error"><AlertCircle size={16} /> Holdings could not be saved. Your current edits remain available to retry.</div>}
    {activeReport && <ReportResults report={activeReport} />}
    <Panel className="history-panel"><PanelHeading title="Recent reports" description={selectedTrust ? `Audit history for ${selectedTrust.name}` : 'Recent report runs across trusts'} right={reports.data?.length ? <span className="count-tag mono">{reports.data.length} RUNS</span> : undefined} />
      {reports.isLoading ? <LoadingBlock label="Loading recent reports" /> : reports.isError ? <ErrorState retry={() => void reports.refetch()} /> : reports.data?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>TRUST</th><th>AS-OF DATE</th><th>RUN TIME</th><th>HOLDINGS</th><th>RESULT</th><th></th></tr></thead><tbody>{reports.data.slice(0, 8).map(report => <tr key={report.id} data-testid={`row-holdings-report-${report.id}`}><td><strong>{report.trustName}</strong><small className="mono">REPORT {report.id}</small></td><td className="mono">{fmtDate(report.asOfDate)}</td><td>{fmtDateTime(report.runAt)}</td><td className="mono">{report.totalHoldingCount}</td><td><span className={report.failCount ? 'outcome-fail' : 'outcome-pass'}>{report.passCount} pass · {report.failCount} fail</span></td><td><button className="row-arrow" aria-label={`Inspect report ${report.id}`} onClick={() => setCurrentReport(report)} data-testid={`button-inspect-report-${report.id}`}><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={FileClock} title="No reports to inspect" text="A run will appear here with its trust, as-of date, and rule outcomes." />}
    </Panel>
  </div>;
}
function ReportResults({ report }: { report: ComplianceReport }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return <Panel className="results-panel"><PanelHeading title="Report result" description="Rule-by-rule outcome from the selected review" right={<div className="result-head-meta"><span className="mono">REPORT {report.id}</span><span className={report.failCount ? 'outcome-fail' : 'outcome-pass'}>{report.failCount ? `${report.failCount} FAIL` : 'ALL PASS'}</span></div>} />
    <div className="result-context-line"><span>TRUST <strong>{report.trustName}</strong></span><i /><span>AS OF <strong className="mono">{fmtDate(report.asOfDate)}</strong></span><i /><span>RUN <strong>{fmtDateTime(report.runAt)}</strong></span><i /><span>HOLDINGS <strong className="mono">{report.totalHoldingCount.toLocaleString()}</strong></span></div>
    <div className="result-summary"><div><strong>{report.passCount}</strong><span>rules passed</span></div><div><strong className={report.failCount ? 'text-fail' : ''}>{report.failCount}</strong><span>rules failed</span></div><div><strong>{report.results.length}</strong><span>rules evaluated</span></div></div>
    {report.results.length ? <div className="result-rule-list">{report.results.map(result => <article className={`result-rule ${result.status.toLowerCase()}`} key={result.ruleId} data-testid={`result-rule-${result.ruleId}`}><div className="result-rule-main"><span className={`result-icon ${result.status.toLowerCase()}`}>{result.status === 'PASS' ? <Check size={15} /> : <AlertCircle size={15} />}</span><div className="result-rule-title"><strong>{result.ruleName}</strong><small className="mono">RULE {result.ruleId} · {result.selectedHoldingCount.toLocaleString()} SELECTED HOLDINGS</small></div><StatusPill status={result.status} /></div><div className="result-rule-measure"><span>{metricLabels[result.limitMetric]}</span><strong className="mono">{amount(result.measuredValue, result.limitMetric !== 'actual_pct')}{result.limitMetric === 'actual_pct' ? '%' : ''}</strong><span>{result.limitComparator}</span><strong className="mono">{amount(result.limitValue, result.limitMetric !== 'actual_pct')}{result.limitMetric === 'actual_pct' ? '%' : ''}</strong><button className="sql-toggle" onClick={() => setExpanded(expanded === result.ruleId ? null : result.ruleId)} data-testid={`button-toggle-sql-${result.ruleId}`}>{expanded === result.ruleId ? 'Hide SQL' : 'View SQL'} <ChevronDown size={13} className={expanded === result.ruleId ? 'rotated' : ''} /></button></div>{expanded === result.ruleId && <pre className="sql-block" data-testid={`text-sql-${result.ruleId}`}>{result.sql}</pre>}</article>)}</div> : <EmptyState icon={ShieldCheck} title="No rule outcomes returned" text="This report contains no evaluated rules." />}
  </Panel>;
}

export default App;
