import { type FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateReportTemplate, useDeleteReportTemplate, useGetReportTemplateFields, useGetReportTemplates, useGetTrusts, useUpdateReportTemplate, getGetReportTemplatesQueryKey } from '@workspace/api-client-react';
import type { ReportTemplate, ReportTemplateColumn, ReportTemplateField, ReportTemplateInput, ReportTemplateSection, ReportTemplateSheet } from '@workspace/api-client-react';
import { AlertCircle, Check, ChevronDown, ChevronRight, FileSpreadsheet, LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';
import './excel-pages.css';

type TemplateDraft = ReportTemplateInput;
const defaults = (fields: ReportTemplateField[]): TemplateDraft => ({
  name: '',
  trustId: null,
  sheets: [{ name: 'Holdings', order: 1, sections: [{ name: 'Portfolio detail', order: 1, twoHeaderRows: false, showHoldings: true, blankRowAfter: false, aggregationLabel: null, bold: false, italic: false, textColor: null, backgroundColor: null, columns: [makeColumn(fields[0], 1)] }] }],
});
function makeColumn(field: ReportTemplateField | undefined, order: number): ReportTemplateColumn {
  return { field: field?.field ?? 'cusip', order, headerLabel: field?.label ?? 'CUSIP', secondHeaderLabel: null, headerBackgroundColor: null, aggregate: false, bold: false, italic: false, textColor: null, backgroundColor: null };
}
const isHex = (value: string | null) => value === null || /^#[0-9a-fA-F]{6}$/.test(value);
function validate(draft: TemplateDraft) {
  if (!draft.name.trim()) return 'Enter a template name.';
  if (!draft.sheets.length) return 'A template needs at least one sheet.';
  for (const [si, sheet] of draft.sheets.entries()) {
    if (!sheet.name.trim() || !positiveUnique(sheet.sections.map(x => x.order))) return `Sheet ${si + 1} needs a name and unique positive section order values.`;
    if (!sheet.sections.length) return `Sheet ${si + 1} needs at least one section.`;
    for (const [ri, section] of sheet.sections.entries()) {
      if (!section.name.trim() || !positiveUnique([section.order]) || !section.columns.length || !positiveUnique(section.columns.map(x => x.order))) return `Section ${si + 1}.${ri + 1} needs a name, columns, and unique positive column order values.`;
      if (section.twoHeaderRows && section.columns.some(c => !c.secondHeaderLabel?.trim())) return `Section “${section.name}” needs a second header label for every column.`;
      const hasAggregates = section.columns.some(c => c.aggregate);
      if (hasAggregates && !section.aggregationLabel?.trim()) return `Section “${section.name}” needs an aggregation label.`;
      if (!section.showHoldings && !hasAggregates) return `Section “${section.name}” must aggregate a numeric field when holdings are hidden.`;
      if (section.columns.some(c => c.aggregate && !['bvAccrued', 'mvAccrued'].includes(c.field))) return 'Aggregation is available only for Book value and Market value.';
      const colors = [section.textColor, section.backgroundColor, ...section.columns.flatMap(c => [c.textColor, c.backgroundColor, c.headerBackgroundColor])];
      if (colors.some(color => !isHex(color))) return 'Colors must use the #RRGGBB format.';
    }
  }
  if (!positiveUnique(draft.sheets.map(x => x.order))) return 'Sheet order values must be unique positive integers.';
  return '';
}
function positiveUnique(values: number[]) { return values.length > 0 && values.every(v => Number.isInteger(v) && v > 0) && new Set(values).size === values.length; }
function copyDraft(template: ReportTemplate): TemplateDraft { return { name: template.name, trustId: template.trustId, sheets: template.sheets.map(s => ({ ...s, sections: s.sections.map(r => ({ ...r, columns: r.columns.map(c => ({ ...c })) })) })) }; }

export default function ReportTemplatesPage() {
  const qc = useQueryClient();
  const templates = useGetReportTemplates();
  const trusts = useGetTrusts();
  const fields = useGetReportTemplateFields();
  const create = useCreateReportTemplate();
  const update = useUpdateReportTemplate();
  const remove = useDeleteReportTemplate();
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const pending = create.isPending || update.isPending;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const issue = validate(draft);
    if (issue) { setError(issue); return; }
    setError('');
    const payload = { ...draft, name: draft.name.trim(), sheets: draft.sheets.map(s => ({ ...s, name: s.name.trim(), sections: s.sections.map(r => ({ ...r, name: r.name.trim(), aggregationLabel: r.columns.some(c => c.aggregate) ? r.aggregationLabel?.trim() || null : null, columns: r.columns.map(c => ({ ...c, headerLabel: c.headerLabel.trim(), secondHeaderLabel: r.twoHeaderRows ? c.secondHeaderLabel?.trim() || null : null })) })) })) };
    const finish = () => { void qc.invalidateQueries({ queryKey: getGetReportTemplatesQueryKey() }); setDraft(null); setEditing(null); };
    if (editing) update.mutate({ templateId: editing.id, data: payload }, { onSuccess: finish });
    else create.mutate({ data: payload }, { onSuccess: finish });
  };
  const begin = (template?: ReportTemplate) => { setEditing(template ?? null); setDraft(template ? copyDraft(template) : defaults(fields.data ?? [])); setError(''); };
  const patchSheet = (si: number, patch: Partial<ReportTemplateSheet>) => setDraft(d => d && ({ ...d, sheets: d.sheets.map((s,i) => i === si ? { ...s, ...patch } : s) }));
  const patchSection = (si: number, ri: number, patch: Partial<ReportTemplateSection>) => setDraft(d => d && ({ ...d, sheets: d.sheets.map((s,i) => i === si ? { ...s, sections: s.sections.map((r,j) => j === ri ? { ...r, ...patch } : r) } : s) }));
  const patchColumn = (si: number, ri: number, ci: number, patch: Partial<ReportTemplateColumn>) => setDraft(d => d && ({ ...d, sheets: d.sheets.map((s,i) => i === si ? { ...s, sections: s.sections.map((r,j) => j === ri ? { ...r, columns: r.columns.map((c,k) => k === ci ? { ...c, ...patch } : c) } : r) } : s) }));
  const addSection = (si: number) => { const sheet = draft?.sheets[si]; if (sheet) patchSheet(si, { sections: [...sheet.sections, { name: 'New section', order: Math.max(0, ...sheet.sections.map(section => section.order)) + 1, twoHeaderRows: false, showHoldings: true, blankRowAfter: false, aggregationLabel: null, bold: false, italic: false, textColor: null, backgroundColor: null, columns: [makeColumn(fields.data?.[0], 1)] }] }); };
  const addColumn = (si: number, ri: number) => { const section = draft?.sheets[si].sections[ri]; if (section) patchSection(si, ri, { columns: [...section.columns, makeColumn(fields.data?.[0], Math.max(0, ...section.columns.map(column => column.order)) + 1)] }); };
  const deleteTemplate = (item: ReportTemplate) => { if (window.confirm(`Delete “${item.name}”? This cannot be undone.`)) remove.mutate({ templateId: item.id }, { onSuccess: () => void qc.invalidateQueries({ queryKey: getGetReportTemplatesQueryKey() }) }); };
  return <div className="page-enter excel-page">
    <div className="page-heading"><div><div className="eyebrow">REPORT CONFIGURATION</div><h1>Excel templates</h1><p>Maintain reusable, audit-ready layouts for month-end holdings.</p></div><button className="button button-primary" onClick={() => begin()} data-testid="button-create-template"><Plus size={15} /> New template</button></div>
    {templates.isLoading ? <div className="loading-block"><div className="skeleton-line wide" /><div className="skeleton-line" /><span>Loading saved templates</span></div> : templates.isError ? <div className="excel-alert"><AlertCircle size={16} /> Templates could not be loaded. <button onClick={() => void templates.refetch()} data-testid="button-retry-templates">Try again</button></div> : !templates.data?.length ? <div className="excel-empty"><FileSpreadsheet size={24} /><strong>No Excel templates yet</strong><span>Create a template to define sheets, sections, and formatted columns.</span><button className="button button-primary" onClick={() => begin()} data-testid="button-create-first-template"><Plus size={14} /> Create template</button></div> :
      <div className="template-list">{templates.data.map(item => <article className="template-card" key={item.id} data-testid={`card-template-${item.id}`}>
        <div className="template-card-top"><button className="template-expand" onClick={() => setExpanded(expanded === item.id ? null : item.id)} data-testid={`button-expand-template-${item.id}`}><span className="template-icon"><FileSpreadsheet size={17} /></span><span className="template-name"><strong>{item.name}</strong><small>{item.trustName ?? 'Unassigned template'} · {item.sheets.length} sheet{item.sheets.length === 1 ? '' : 's'} · created {new Date(item.createdAt).toLocaleDateString()}</small></span>{expanded === item.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button><div className="row-actions"><button className="icon-button" onClick={() => begin(item)} title="Edit template" aria-label={`Edit ${item.name}`} data-testid={`button-edit-template-${item.id}`}><Save size={15} /></button><button className="icon-button danger" onClick={() => deleteTemplate(item)} title="Delete template" aria-label={`Delete ${item.name}`} data-testid={`button-delete-template-${item.id}`}><Trash2 size={15} /></button></div></div>
        {expanded === item.id && <div className="template-structure">{item.sheets.slice().sort((a,b) => a.order-b.order).map((sheet, idx) => <div key={`${sheet.order}-${sheet.name}`}><strong>{sheet.order}. {sheet.name}</strong><span>{sheet.sections.slice().sort((a,b) => a.order-b.order).map(section => `${section.order}. ${section.name} (${section.columns.length} columns)`).join('  ·  ')}</span></div>)}</div>}
      </article>)}</div>}
    {(create.isError || update.isError || remove.isError) && <div className="excel-alert" role="alert"><AlertCircle size={15} /> The change could not be saved. Review the template and try again.</div>}
    {draft && <div className="excel-modal-backdrop" role="presentation"><section className="excel-editor" role="dialog" aria-modal="true" aria-label={editing ? 'Edit Excel template' : 'Create Excel template'}>
      <header className="excel-editor-head"><div><div className="eyebrow">TEMPLATE DESIGNER</div><h2>{editing ? 'Edit template' : 'New template'}</h2><p>Orders may contain gaps, but must be unique within their level.</p></div><button className="icon-button" onClick={() => setDraft(null)} aria-label="Close editor" data-testid="button-close-template-editor"><X size={17} /></button></header>
      <form className="excel-editor-form" onSubmit={save}>
        <div className="excel-template-fields"><label className="field"><span>Template name</span><input value={draft.name} onChange={e => setDraft(d => d && ({ ...d, name: e.target.value }))} required data-testid="input-template-name" placeholder="e.g. Monthly investment schedule" /></label><label className="field"><span>Trust assignment <small>Optional</small></span><select value={draft.trustId ?? ''} onChange={e => setDraft(d => d && ({ ...d, trustId: e.target.value ? Number(e.target.value) : null }))} data-testid="select-template-trust"><option value="">Unassigned</option>{(trusts.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
        {draft.sheets.map((sheet, si) => <section className="sheet-editor" key={si} data-testid={`section-sheet-${si}`}><div className="editor-level-heading"><span className="level-index">SHEET {si + 1}</span><button type="button" className="text-action danger-text" onClick={() => setDraft(d => d && d.sheets.length > 1 ? ({ ...d, sheets: d.sheets.filter((_,i) => i !== si) }) : d)} disabled={draft.sheets.length <= 1} data-testid={`button-remove-sheet-${si}`}><Trash2 size={13} /> Remove sheet</button></div>
          <div className="compact-fields"><label className="field"><span>Sheet name</span><input value={sheet.name} onChange={e => patchSheet(si,{name:e.target.value})} required data-testid={`input-sheet-name-${si}`} /></label><label className="field order-field"><span>Order</span><input type="number" min="1" step="1" value={sheet.order} onChange={e => patchSheet(si,{order:Number(e.target.value)})} data-testid={`input-sheet-order-${si}`} /></label></div>
          {sheet.sections.map((section, ri) => <div className="section-editor" key={ri}><div className="editor-level-heading"><strong>Section {ri + 1}</strong><button type="button" className="text-action danger-text" onClick={() => patchSheet(si,{sections:sheet.sections.filter((_,i)=>i!==ri)})} disabled={sheet.sections.length <= 1} data-testid={`button-remove-section-${si}-${ri}`}><Trash2 size={13} /> Remove</button></div>
            <div className="compact-fields"><label className="field"><span>Section name</span><input value={section.name} onChange={e=>patchSection(si,ri,{name:e.target.value})} required data-testid={`input-section-name-${si}-${ri}`} /></label><label className="field order-field"><span>Order</span><input type="number" min="1" step="1" value={section.order} onChange={e=>patchSection(si,ri,{order:Number(e.target.value)})} data-testid={`input-section-order-${si}-${ri}`} /></label></div>
            <div className="toggle-rack">{([[ 'twoHeaderRows','Two header rows'],['showHoldings','Show holdings and column headers'],['blankRowAfter','Blank row after']] as const).map(([key,label])=><label className="toggle-label" key={key}><input type="checkbox" checked={section[key]} onChange={e=>patchSection(si,ri,{[key]:e.target.checked})} data-testid={`toggle-${key}-${si}-${ri}`} />{label}</label>)}</div>
            {!section.showHoldings&&<div className="aggregation-hint">Holdings rows and column headers are hidden; only aggregated totals will be shown.</div>}
            <StyleControls id={`section-${si}-${ri}`} bold={section.bold} italic={section.italic} textColor={section.textColor} backgroundColor={section.backgroundColor} onChange={patch=>patchSection(si,ri,patch)} />
            <div className="column-list">{section.columns.map((column, ci)=><div className="column-editor" key={ci}><div className="column-editor-title"><span className="mono">COLUMN {ci+1}</span><button type="button" className="text-action danger-text" onClick={()=>patchSection(si,ri,{columns:section.columns.filter((_,i)=>i!==ci)})} disabled={section.columns.length<=1} data-testid={`button-remove-column-${si}-${ri}-${ci}`}><Trash2 size={12} /> Remove</button></div>
              <div className="column-fields"><label className="field"><span>Holdings field</span><select value={column.field} onChange={e=>{const field=fields.data?.find(f=>f.field===e.target.value);patchColumn(si,ri,ci,{field:field?.field ?? column.field,headerLabel:field?.label ?? column.headerLabel,aggregate:field?.numeric && ['bvAccrued','mvAccrued'].includes(field.field) ? column.aggregate : false})}} data-testid={`select-column-field-${si}-${ri}-${ci}`}>{(fields.data??[]).map(f=><option key={f.field} value={f.field}>{f.label}</option>)}</select></label><label className="field order-field"><span>Order</span><input type="number" min="1" step="1" value={column.order} onChange={e=>patchColumn(si,ri,ci,{order:Number(e.target.value)})} data-testid={`input-column-order-${si}-${ri}-${ci}`} /></label></div>
              <div className="column-fields"><label className="field"><span>Header label</span><input value={column.headerLabel} onChange={e=>patchColumn(si,ri,ci,{headerLabel:e.target.value})} required data-testid={`input-column-header-${si}-${ri}-${ci}`} /></label>{section.twoHeaderRows&&<label className="field"><span>Second header label</span><input value={column.secondHeaderLabel??''} onChange={e=>patchColumn(si,ri,ci,{secondHeaderLabel:e.target.value})} required data-testid={`input-column-second-header-${si}-${ri}-${ci}`} /></label>}</div>
              <div className="toggle-rack column-toggles"><label className="toggle-label"><input type="checkbox" checked={column.aggregate} disabled={!['bvAccrued','mvAccrued'].includes(column.field)} onChange={e=>patchColumn(si,ri,ci,{aggregate:e.target.checked})} data-testid={`toggle-column-aggregate-${si}-${ri}-${ci}`} />Aggregate numeric values</label></div>
              <StyleControls id={`column-${si}-${ri}-${ci}`} bold={column.bold} italic={column.italic} textColor={column.textColor} backgroundColor={column.backgroundColor} headerBackgroundColor={column.headerBackgroundColor} onChange={patch=>patchColumn(si,ri,ci,patch)} />
            </div>)}</div>
            <button type="button" className="text-action" onClick={()=>addColumn(si,ri)} data-testid={`button-add-column-${si}-${ri}`}><Plus size={13} /> Add column</button>
            {section.columns.some(c=>c.aggregate)&&<label className="field aggregation-field"><span>Aggregation label</span><input value={section.aggregationLabel??''} onChange={e=>patchSection(si,ri,{aggregationLabel:e.target.value})} required data-testid={`input-aggregation-label-${si}-${ri}`} placeholder="e.g. Total portfolio value" /></label>}
          </div>)}
          <button type="button" className="text-action section-add" onClick={()=>addSection(si)} data-testid={`button-add-section-${si}`}><Plus size={13} /> Add section</button>
        </section>)}
         <button type="button" className="add-sheet-button" onClick={()=>setDraft(d=>d&&({...d,sheets:[...d.sheets,{name:`Sheet ${d.sheets.length+1}`,order:Math.max(0,...d.sheets.map(sheet=>sheet.order))+1,sections:[{name:'New section',order:1,twoHeaderRows:false,showHoldings:true,blankRowAfter:false,aggregationLabel:null,bold:false,italic:false,textColor:null,backgroundColor:null,columns:[makeColumn(fields.data?.[0],1)]}]}]}))} data-testid="button-add-sheet"><Plus size={14}/> Add sheet</button>
        {(fields.isError||trusts.isError)&&<div className="excel-alert" role="alert"><AlertCircle size={15}/> Supporting template fields or trusts could not be loaded.</div>}
        {error&&<div className="excel-alert" role="alert" data-testid="status-template-validation"><AlertCircle size={15}/>{error}</div>}
        {(create.isError||update.isError)&&<div className="excel-alert" role="alert"><AlertCircle size={15}/> Save failed. Try again; your editor values are retained.</div>}
        <footer className="excel-editor-actions"><button type="button" className="button button-outline" onClick={()=>setDraft(null)} data-testid="button-cancel-template"><X size={14}/> Cancel</button><button className="button button-primary" type="submit" disabled={pending||fields.isLoading||trusts.isLoading} data-testid="button-save-template">{pending?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>} {pending?'Saving template':'Save template'}</button></footer>
      </form>
    </section></div>}
  </div>;
}

function StyleControls({id,bold,italic,textColor,backgroundColor,headerBackgroundColor,onChange}:{id:string;bold:boolean;italic:boolean;textColor:string|null;backgroundColor:string|null;headerBackgroundColor?:string|null;onChange:(patch:{bold?:boolean;italic?:boolean;textColor?:string|null;backgroundColor?:string|null;headerBackgroundColor?:string|null})=>void}) {
  const color = (key:string,value:string|null,update:(value:string|null)=>void) => <label className="color-control" key={key}><span>{key}</span><input type="text" value={value??''} placeholder="#RRGGBB" maxLength={7} onChange={e=>update(e.target.value||null)} data-testid={`input-${key.toLowerCase().replaceAll(' ','-')}-${id}`} /><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value??'')?value!:'#ffffff'} onChange={e=>update(e.target.value)} aria-label={`Choose ${key}`} data-testid={`color-${key.toLowerCase().replaceAll(' ','-')}-${id}`} /></label>;
  return <div className="style-controls"><label className="toggle-label"><input type="checkbox" checked={bold} onChange={e=>onChange({bold:e.target.checked})} data-testid={`toggle-bold-${id}`}/>Bold</label><label className="toggle-label"><input type="checkbox" checked={italic} onChange={e=>onChange({italic:e.target.checked})} data-testid={`toggle-italic-${id}`}/>Italic</label>{color('Text color',textColor,v=>onChange({textColor:v}))}{color('Background color',backgroundColor,v=>onChange({backgroundColor:v}))}{headerBackgroundColor !== undefined&&color('Header background',headerBackgroundColor,v=>onChange({headerBackgroundColor:v}))}</div>;
}
