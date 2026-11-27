import { useMemo, useState } from 'react';
import { useGetTrusts, useGetReportTemplates, useGetHoldingDates, getGetHoldingDatesQueryKey, getGetReportTemplatesQueryKey, useGenerateReportTemplate } from '@workspace/api-client-react';
import { AlertCircle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, RefreshCw } from 'lucide-react';
import './excel-pages.css';

export default function ExcelReportsPage() {
  const trusts = useGetTrusts();
  const [trustValue, setTrustValue] = useState('');
  const [templateValue, setTemplateValue] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [completedFile, setCompletedFile] = useState('');
  const trustId = Number(trustValue) || 0;
  const params = useMemo(() => trustId ? { trustId } : {}, [trustId]);
  const templates = useGetReportTemplates(params, { query: { queryKey: getGetReportTemplatesQueryKey(params) } });
  const dateParams = useMemo(() => ({ trustId }), [trustId]);
  const dates = useGetHoldingDates(dateParams, { query: { enabled: !!trustId, queryKey: getGetHoldingDatesQueryKey(dateParams) } });
  const generate = useGenerateReportTemplate();
  const selectedTemplate = templates.data?.find(template => template.id === Number(templateValue));
  const eligibleTemplates = (templates.data ?? []).filter(template => template.trustId === trustId);
  const download = () => {
    if (!selectedTemplate || !dateValue || selectedTemplate.trustId !== trustId) return;
    generate.mutate({ templateId: selectedTemplate.id, data: { asOfDate: dateValue } }, {
      onSuccess: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${selectedTemplate.name.replace(/[\\/:*?"<>|]/g, '_')}_${dateValue}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setCompletedFile(`${selectedTemplate.name.replace(/[\\/:*?"<>|]/g, '_')}_${dateValue}.xlsx`);
      },
    });
  };
  const changeTrust = (value: string) => { setTrustValue(value); setTemplateValue(''); setDateValue(''); setCompletedFile(''); };
  const changeTemplate = (value: string) => { setTemplateValue(value); setCompletedFile(''); };
  const changeDate = (value: string) => { setDateValue(value); setCompletedFile(''); };
  const canGenerate = !!selectedTemplate && selectedTemplate.trustId === trustId && !!dateValue && !generate.isPending;

  return <div className="page-enter excel-page">
    <div className="page-heading"><div><div className="eyebrow">MONTH-END WORKSPACE</div><h1>Excel reports</h1><p>Generate a formatted holdings workbook from an assigned template and reporting date.</p></div></div>
    <div className="export-layout">
      <section className="export-panel">
        <div className="export-panel-heading"><span className="export-mark"><FileSpreadsheet size={19}/></span><div><h2>Build a workbook</h2><p>Choose the reporting context. The generated file is downloaded to your device.</p></div></div>
        <div className="export-fields">
          <label className="field"><span>Trust</span><select value={trustValue} onChange={e=>changeTrust(e.target.value)} data-testid="select-export-trust"><option value="">Select a trust</option>{(trusts.data??[]).map(trust=><option key={trust.id} value={trust.id}>{trust.name}</option>)}</select></label>
          {trusts.isLoading&&<div className="inline-feedback" data-testid="status-trust-loading">Loading trust records…</div>}
          {trusts.isError&&<div className="excel-alert" role="alert"><AlertCircle size={15}/> Trusts could not be loaded. <button onClick={()=>void trusts.refetch()} data-testid="button-retry-export-trusts">Retry</button></div>}
          <label className="field"><span>Excel template</span><select value={templateValue} onChange={e=>changeTemplate(e.target.value)} disabled={!trustId||templates.isLoading||templates.isError} data-testid="select-export-template"><option value="">Select an assigned template</option>{eligibleTemplates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          {!!trustId&&templates.isLoading&&<div className="inline-feedback" data-testid="status-template-loading">Loading assigned templates…</div>}
          {!!trustId&&templates.isError&&<div className="excel-alert" role="alert"><AlertCircle size={15}/> Templates could not be loaded. <button onClick={()=>void templates.refetch()} data-testid="button-retry-export-templates">Retry</button></div>}
          {!!trustId&&!templates.isLoading&&!templates.isError&&eligibleTemplates.length===0&&<div className="inline-feedback warning" data-testid="status-no-assigned-template">No templates are linked to this trust. Assign one in Excel templates before exporting.</div>}
          <label className="field"><span>Holdings as of</span><select value={dateValue} onChange={e=>changeDate(e.target.value)} disabled={!trustId||dates.isLoading||dates.isError} data-testid="select-export-date"><option value="">Select an available date</option>{(dates.data??[]).map(date=><option key={date} value={date}>{new Intl.DateTimeFormat('en-US',{month:'long',day:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`))}</option>)}</select></label>
          {!!trustId&&dates.isLoading&&<div className="inline-feedback" data-testid="status-dates-loading"><span className="mini-skeleton"/> Checking available month-end dates…</div>}
          {!!trustId&&dates.isError&&<div className="excel-alert" role="alert"><AlertCircle size={15}/> Available dates could not be loaded. <button onClick={()=>void dates.refetch()} data-testid="button-retry-export-dates"><RefreshCw size={13}/> Retry</button></div>}
          {!!trustId&&!dates.isLoading&&!dates.isError&&dates.data?.length===0&&<div className="inline-feedback warning" data-testid="status-no-dates">No holdings dates are available for this trust.</div>}
        </div>
        <button className="button button-primary export-submit" onClick={download} disabled={!canGenerate} data-testid="button-generate-excel">{generate.isPending?<LoaderCircle className="spin" size={16}/>:<Download size={16}/>} {generate.isPending?'Preparing workbook…':'Generate .xlsx'}</button>
        {generate.isError&&<div className="excel-alert export-feedback" role="alert" data-testid="status-export-error"><AlertCircle size={15}/> The workbook could not be generated. Your selections are unchanged; try again.</div>}
        {completedFile&&<div className="export-success" role="status" data-testid="status-export-success"><CheckCircle2 size={16}/><span><strong>Workbook downloaded</strong><small>{completedFile}</small></span></div>}
      </section>
      <aside className="export-aside">
        <div className="aside-date-icon"><CalendarDays size={18}/></div><span className="overline">EXPORT CHECKLIST</span><h3>One clear path to month-end.</h3><p>Only templates assigned to the selected trust are available here. Dates are drawn from actual holdings records.</p>
        <ol><li><span>01</span><div><strong>Choose a trust</strong><small>Sets template access and holdings context.</small></div></li><li><span>02</span><div><strong>Choose its template</strong><small>Saved sheet and formatting rules are applied.</small></div></li><li><span>03</span><div><strong>Select an available date</strong><small>Exports the holdings snapshot for that date.</small></div></li></ol>
        <div className="audit-note"><CheckCircle2 size={14}/> Export uses saved template configuration</div>
      </aside>
    </div>
  </div>;
}

