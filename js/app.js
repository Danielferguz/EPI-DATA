import { readFile, download, toCSV } from './io.js?v=2026.10.16-1';
import { inferMeta, typedData, NA_DEFAULT, isMiss, missCount, levelsOf, completeRows } from './data.js?v=2026.10.16-1';
import { runAnalysis, fitModel, fitPooled, termsOf, modelVars, measureOf, fitStats, coefCI, TYPES } from './analysis.js?v=2026.10.16-1';
import { assumptions, lowess } from './diag.js?v=2026.10.16-1';
import { missingSummary, patterns, littleMCAR, compareByMissing, missingnessModel, mice, simpleImpute } from './missing.js?v=2026.10.16-1';
import { purposeful, backward, changeInEstimate, effectModification } from './select.js?v=2026.10.16-1';
import { km, logrank } from './models.js?v=2026.10.16-1';
import { forestTable, scatterPlot, qqPlot, histPlot, cookPlot, rocPlot, calibPlot, schoenfeldPlot, kmPlot, missBarPlot, patternPlot, tracePlot, stripPlot, catImpPlot, tippingPlot, profilePlot, spaghettiPlot } from './plots.js?v=2026.10.16-1';
import { figWrap, bindFigs } from './figs.js?v=2026.10.16-1';
import { table1, table1HTML, resultsMatrix, matrixHTML, matrixCSV, wordDoc, methodsText } from './report.js?v=2026.10.16-1';
import { mean, sd, quantile } from './tests.js?v=2026.10.16-1';
import { qt, pchisqU } from './dist.js?v=2026.10.16-1';
import { HELP_HTML } from './help.js?v=2026.10.16-1';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));
const f2 = (x, d = 2) => (isFinite(x) ? (Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(d)) : '–');
const pct = x => (isFinite(x) ? (100 * x).toFixed(1) + '%' : '–');
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label ?? v)}</option>`;
const errBox = e => `<div class="err">${esc(e.message || e)}</div>`;
const card = (title, body, extra = '') => `<div class="card"${extra}><h2>${title}</h2>${body}</div>`;
const tick = () => new Promise(r => setTimeout(r, 20));

const state = { sheets: null, sheet: null, raw: [], meta: {}, ds: null, mi: null, little: null, type: 'logistic', inter: [], spec: null, R: null, sel: null, source: 'cc', lang: 'es', delta: false, fname: '' };

// ---------------- pestañas ----------------
$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(t) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  if (t === 'reporte') renderReport();
  if (t === 'modelizacion') renderSelCtx();
  window.scrollTo({ top: 0 });
}
$('#help').innerHTML = HELP_HTML;
function gate() {
  $$('.need-data').forEach(e => (e.hidden = !!state.ds)); $$('.has-data').forEach(e => (e.hidden = !state.ds));
  $$('.need-model').forEach(e => (e.hidden = !!state.R)); $$('.has-model').forEach(e => (e.hidden = !state.R));
}

// ---------------- carga de datos ----------------
$('#file').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));
const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]));
$$('[data-example]').forEach(b => b.addEventListener('click', async () => {
  const r = await fetch(b.dataset.example), txt = await r.text();
  await loadFile(new File([txt], b.dataset.example.split('/').pop(), { type: 'text/csv' }));
  // valores por defecto útiles para cada ejemplo
  const name = b.dataset.example;
  if (name.includes('dolor')) { setMeta('grupo_edad', { ref: '≥ 60 años' }); setMeta('tiempo_dolor', { ref: '≥ 12 meses' }); setMeta('depresion', { event: 'Sí' }); setMeta('relacion_familiar', { ref: 'Funcional' }); Object.assign(state, { type: 'poisson' }); state.spec = { type: 'poisson', y: 'depresion', exposure: 'grupo_edad', covs: ['sexo', 'estado_civil', 'habitos_nocivos', 'relacion_familiar', 'comorbilidad', 'dolor_poliarticular', 'tiempo_dolor', 'intensidad_dolor', 'terapia_psicologia', 'terapia_fisica'], inter: [] }; }
  if (name.includes('cohorte')) { setMeta('muerte', { event: '1' }); state.type = 'cox'; state.spec = { type: 'cox', time: 'tiempo_meses', status: 'muerte', exposure: 'tratamiento', covs: ['edad', 'sexo', 'estadio', 'albumina'], inter: [] }; }
  if (name.includes('longitudinal')) { setMeta('pa_controlada', { event: 'Sí' }); state.type = 'lmm'; state.spec = { type: 'lmm', y: 'pas', id: 'id', tvar: 'mes', exposure: 'grupo', covs: ['mes', 'edad', 'sexo'], inter: [['grupo', 'mes']] }; state.inter = [['grupo', 'mes']]; }
  renderVarTable(); renderSpecForm();
}));
function setMeta(v, o) { if (state.meta[v]) Object.assign(state.meta[v], o); rebuild(); }

async function loadFile(file) {
  try {
    const { sheets } = await readFile(file);
    state.sheets = sheets; state.fname = file.name.replace(/\.[^.]+$/, '');
    $('#sheet').innerHTML = Object.keys(sheets).map(s => opt(s)).join('');
    setSheet(Object.keys(sheets)[0]);
  } catch (e) { $('#load-msg').innerHTML = errBox(e); }
}
$('#sheet').addEventListener('change', e => setSheet(e.target.value));
const naCodes = () => [...NA_DEFAULT, ...$('#na-codes').value.split(',').map(s => s.trim()).filter(Boolean)];
$('#na-apply').addEventListener('click', () => state.raw.length && setSheet(state.sheet, true));
function setSheet(name, keepTypes = false) {
  state.sheet = name; state.raw = state.sheets[name] || [];
  if (!state.raw.length) { $('#load-msg').innerHTML = errBox('La hoja está vacía.'); return; }
  const old = state.meta; state.meta = inferMeta(state.raw, naCodes());
  if (keepTypes) for (const [k, m] of Object.entries(old)) if (state.meta[k] && (m.type !== 'num' || state.meta[k].allNum)) Object.assign(state.meta[k], { type: m.type, ref: state.meta[k].levels.includes(m.ref) ? m.ref : state.meta[k].ref, event: state.meta[k].levels.includes(m.event) ? m.event : state.meta[k].event });
  state.mi = null; state.R = null; state.little = null; state.inter = []; state.spec = null;
  rebuild();
  $('#load-msg').innerHTML = `<p class="pill">✓ ${esc(state.fname)}: ${state.raw.length} filas × ${Object.keys(state.meta).length} columnas</p>`;
  $('#vars-card').hidden = $('#t1-card').hidden = false;
  renderVarTable(); renderPreview(); renderMissing(); renderSpecForm(); $('#model-out').innerHTML = ''; $('#mi-out').innerHTML = ''; $('#mi-status').textContent = ''; $('#mi-dl').hidden = true; gate();
}
function rebuild() {
  const active = Object.fromEntries(Object.entries(state.meta).filter(([, m]) => m.type !== 'skip'));
  state.ds = typedData(state.raw, active, naCodes());
}
const usable = (...types) => Object.values(state.meta).filter(m => m.type !== 'skip' && (!types.length || types.includes(m.type))).map(m => m.name);

function renderVarTable() {
  const T = $('#vartable');
  T.innerHTML = `<thead><tr><th>Variable</th><th>Tipo</th><th>Referencia</th><th>Evento (si es desenlace binario)</th><th class="num">Perdidos</th><th>Resumen</th></tr></thead><tbody>${Object.values(state.meta).map(m => {
    const col = state.ds.cols[m.name], miss = col ? missCount(col) : 0, isCat = m.type === 'cat';
    let summ = '';
    if (m.type === 'num' && col) { const v = Array.from(col).filter(isFinite); summ = `media ${f2(mean(v))} ± ${f2(sd(v))}; rango ${f2(Math.min(...v))}–${f2(Math.max(...v))}`; }
    else if (col && isCat) { const c = {}; col.forEach(x => x != null && (c[x] = (c[x] || 0) + 1)); summ = levelsOf(m).slice(0, 6).map(l => `${l} (${c[l] || 0})`).join(' · ') + (m.levels.length > 6 ? ` … (${m.levels.length} niveles)` : ''); }
    else if (m.type === 'id') summ = `${m.nDistinct} valores distintos`;
    return `<tr data-v="${esc(m.name)}"><td class="b">${esc(m.name)}</td>
      <td><select data-k="type">${opt('num', 'Cuantitativa', m.type === 'num')}${opt('cat', 'Categórica', m.type === 'cat')}${opt('id', 'Identificador', m.type === 'id')}${opt('skip', 'Excluir', m.type === 'skip')}</select></td>
      <td>${isCat ? `<select data-k="ref">${m.levels.map(l => opt(l, l, l === m.ref)).join('')}</select>` : ''}</td>
      <td>${isCat ? `<select data-k="event">${m.levels.map(l => opt(l, l, l === m.event)).join('')}</select>` : ''}</td>
      <td class="num">${m.type === 'skip' ? '' : `${miss} (${pct(miss / state.raw.length)})`}</td><td class="sub">${esc(summ)}</td></tr>`;
  }).join('')}</tbody>`;
  T.querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    const v = s.closest('tr').dataset.v, k = s.dataset.k, m = state.meta[v];
    if (k === 'type' && s.value === 'num' && !m.allNum) { alert(`«${v}» contiene valores no numéricos; no puede tratarse como cuantitativa.`); s.value = m.type; return; }
    m[k] = s.value; rebuild(); state.mi = null; $('#mi-out').innerHTML = ''; $('#mi-status').textContent = '';
    if (k === 'type') { renderVarTable(); renderMissing(); }
    renderSpecForm();
  }));
  $('#t1-group').innerHTML = opt('', '— sin grupos —') + usable('cat').map(v => opt(v)).join('');
}
function renderPreview() {
  const cols = Object.keys(state.meta), rows = state.raw.slice(0, 50);
  $('#preview').innerHTML = `<table class="data"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] instanceof Date ? r[c].toISOString().slice(0, 10) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
// Tabla 1
let lastT1 = null;
$('#t1-run').addEventListener('click', () => {
  const g = $('#t1-group').value || null, vars = usable('num', 'cat');
  try { lastT1 = table1(state.ds, state.meta, vars, g); $('#t1-out').innerHTML = `<div class="tablewrap tall">${table1HTML(lastT1)}</div>`; } catch (e) { $('#t1-out').innerHTML = errBox(e); }
});
$('#t1-doc').addEventListener('click', () => lastT1 && download('Tabla1.doc', wordDoc('Tabla 1. Características de la población', matrixHTML({ head: lastT1.head, body: lastT1.rows.map(r => ({ b: r.bold, c: r.cells })) }), lastT1.note), 'application/msword'));
$('#t1-csv').addEventListener('click', () => lastT1 && download('Tabla1.csv', matrixCSV({ head: lastT1.head, body: lastT1.rows.map(r => ({ c: r.cells })) }), 'text/csv'));

// ---------------- casillas ----------------
function checks(el, vars, checked, name) {
  el.innerHTML = `<div class="tools"><a data-all="1">todas</a><a data-all="0">ninguna</a></div>` + vars.map(v => `<label><input type="checkbox" name="${name}" value="${esc(v)}"${checked.includes(v) ? ' checked' : ''}> ${esc(v)}</label>`).join('');
  el.querySelectorAll('[data-all]').forEach(a => a.addEventListener('click', () => { el.querySelectorAll('input').forEach(i => (i.checked = a.dataset.all === '1')); el.dispatchEvent(new Event('change')); }));
}
const checked = el => [...el.querySelectorAll('input:checked')].map(i => i.value);

// ---------------- datos perdidos ----------------
function renderMissing() {
  const ds = state.ds, vars = usable('num', 'cat');
  const S = missingSummary(ds, vars), withMiss = S.filter(s => s.miss > 0), cc = completeRows(ds, vars).length;
  const cells = S.reduce((a, s) => a + s.miss, 0);
  $('#miss-kpis').innerHTML = [[ds.n, 'filas'], [`${cc} (${pct(cc / ds.n)})`, 'casos completos'], [`${withMiss.length} de ${vars.length}`, 'variables con perdidos'], [pct(cells / (ds.n * vars.length)), 'celdas perdidas']].map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
  $('#miss-bar').innerHTML = withMiss.length ? figWrap(missBarPlot(withMiss.sort((a, b) => b.pct - a.pct)), 'perdidos_por_variable') : '<p class="muted">No hay datos perdidos en las variables analizables.</p>';
  const pv = withMiss.map(s => s.v);
  $('#miss-pat').innerHTML = pv.length ? figWrap(patternPlot(patterns(ds, pv), pv), 'patrones_perdidos') : '';
  const mc = vars.filter(v => state.meta[v].type === 'num' || state.meta[v].levels.length === 2);
  checks($('#mcar-vars'), mc, mc.slice(0, 25), 'mcar');
  $('#mcar-out').innerHTML = '';
  $('#mar-target').innerHTML = pv.map(v => opt(v)).join('');
  renderMAR();
  checks($('#mi-vars'), vars, vars, 'mi');
  updateMech();
  bindFigs(document);
}
$('#mcar-run').addEventListener('click', () => {
  const vars = checked($('#mcar-vars'));
  if (vars.length < 2) { $('#mcar-out').innerHTML = errBox('Seleccione al menos 2 variables.'); return; }
  try {
    const r = littleMCAR(state.ds, state.meta, vars); state.little = r;
    $('#mcar-out').innerHTML = `<div class="kpis"><div class="kpi"><b>${f2(r.stat)}</b><span>χ² de Little</span></div><div class="kpi"><b>${r.df}</b><span>gl</span></div><div class="kpi"><b>${fp(r.p)}</b><span>valor p</span></div><div class="kpi"><b>${r.npat}</b><span>patrones</span></div></div>
      <p class="${r.p < 0.05 ? 'bad' : 'ok'}">${r.p < 0.05 ? '✗ Se rechaza MCAR: la pérdida se relaciona con los valores observados (compatible con MAR o MNAR).' : '✓ No se rechaza MCAR (la prueba tiene baja potencia; no prueba que los datos sean MCAR).'}</p>${r.conv ? '' : '<p class="warn">El algoritmo EM no convergió por completo.</p>'}`;
  } catch (e) { $('#mcar-out').innerHTML = errBox(e); }
  updateMech();
});
$('#mar-target').addEventListener('change', renderMAR);
let marRes = null;
function renderMAR() {
  const t = $('#mar-target').value, out = $('#mar-out');
  if (!t) { out.innerHTML = ''; marRes = null; return; }
  const vars = usable('num', 'cat'), cmp = compareByMissing(state.ds, state.meta, t, vars);
  const preds = vars.filter(v => v !== t && missCount(state.ds.cols[v]) / state.ds.n <= 0.2 && (state.meta[v].type === 'num' || state.meta[v].levels.length <= 8)).slice(0, 15);
  const mm = missingnessModel(state.ds, state.meta, t, preds); marRes = { t, cmp, mm };
  const sig = cmp.filter(c => c.p < 0.05);
  out.innerHTML = `<div class="tablewrap"><table class="data"><thead><tr><th>Variable</th><th>Con dato perdido en ${esc(t)}</th><th>Con dato observado</th><th>Prueba</th><th class="num">p</th></tr></thead><tbody>${cmp.map(c => `<tr><td>${esc(c.w)}</td><td>${c.kind === 'num' ? f2(c.sMiss) : c.kind === 'cat' ? c.levels.map((l, k) => `${esc(l)}: ${pct(c.sMiss[k] / (c.sMiss.reduce((a, b) => a + b, 0) || 1))}`).join('; ') : ''}</td><td>${c.kind === 'num' ? f2(c.sObs) : c.kind === 'cat' ? c.levels.map((l, k) => `${esc(l)}: ${pct(c.sObs[k] / (c.sObs.reduce((a, b) => a + b, 0) || 1))}`).join('; ') : ''}</td><td>${c.test}</td><td class="num${c.p < 0.05 ? ' b' : ''}">${fp(c.p)}</td></tr>`).join('')}</tbody></table></div>
  ${mm && !mm.error ? `<p class="small">Modelo logístico de la probabilidad de pérdida de <b>${esc(t)}</b> (n = ${mm.n}, ${mm.events} perdidos): χ² RV = ${f2(mm.lr)}, gl = ${mm.df}, <b>p = ${fp(mm.p)}</b>; AUC = ${f2(mm.auc, 3)}. ${mm.fit.p.map((p, j) => (j && p < 0.05 ? `${esc(mm.D.cols[j].label)} (OR ${f2(Math.exp(mm.fit.beta[j]))}, p ${fp(p)})` : null)).filter(Boolean).join('; ') || 'Ningún predictor individual con p < 0.05.'}</p>` : mm?.error ? `<p class="warn">${esc(mm.error)}</p>` : '<p class="muted small">Muy pocos perdidos para modelar la pérdida.</p>'}
  <p class="small">${sig.length ? `La pérdida de <b>${esc(t)}</b> se asocia con: ${sig.map(c => esc(c.w)).join(', ')}. Incluya estas variables en el modelo de imputación (supuesto MAR).` : `No se encontraron variables observadas asociadas a la pérdida de ${esc(t)}.`}</p>`;
  updateMech();
}
function updateMech() {
  const L = state.little, sig = marRes?.cmp?.some(c => c.p < 0.05) || marRes?.mm?.p < 0.05, el = $('#mech-msg');
  const anyMiss = usable('num', 'cat').some(v => missCount(state.ds.cols[v]) > 0);
  if (!anyMiss) { el.innerHTML = '<p>✓ No hay datos perdidos: no se requiere imputación.</p>'; return; }
  el.innerHTML = `<p><b>Interpretación.</b> ${L ? (L.p >= 0.05 && !sig ? 'Los datos son <b>compatibles con MCAR</b>: el análisis de casos completos es insesgado aunque pierde precisión; la imputación múltiple recupera potencia.' : 'Hay evidencia <b>contra MCAR</b>' + (sig ? ': la pérdida depende de variables observadas, lo que es compatible con <b>MAR</b>. La imputación múltiple con esas variables en el modelo de imputación es el análisis principal recomendado.' : '.')) : 'Calcule la prueba de Little y explore las variables con perdidos.'}</p>
  <p><b>MNAR</b> (la pérdida depende del propio valor no observado) <b>no puede comprobarse</b> con los datos observados. Tras imputar, use en el paso 3 el <b>análisis de sensibilidad δ</b> para ver cuánto tendría que desviarse el dato perdido para cambiar las conclusiones.</p>`;
}

// MICE
$('#mi-run').addEventListener('click', async () => {
  const vars = checked($('#mi-vars')), prog = $('#mi-prog'), st = $('#mi-status');
  if (vars.length < 2) { $('#mi-out').innerHTML = errBox('Seleccione al menos 2 variables.'); return; }
  if (!vars.some(v => missCount(state.ds.cols[v]) > 0)) { $('#mi-out').innerHTML = errBox('Ninguna de las variables seleccionadas tiene datos perdidos.'); return; }
  const m = Math.max(2, +$('#mi-m').value || 20), maxit = Math.max(1, +$('#mi-it').value || 10), seed = +$('#mi-seed').value || 2024, donors = +$('#mi-donors').value || 5;
  prog.hidden = false; prog.value = 0; st.textContent = 'Imputando…'; $('#mi-run').disabled = true;
  try {
    const t0 = performance.now();
    state.mi = await mice(state.ds, state.meta, { vars, m, maxit, seed, donors, onProgress: v => (prog.value = v) });
    st.textContent = `✓ ${m} conjuntos imputados en ${((performance.now() - t0) / 1000).toFixed(1)} s. Elija «Imputación múltiple» como fuente de datos en el paso 3.`;
    $('#mi-dl').hidden = false; renderMI(); renderSpecForm(true);
  } catch (e) { $('#mi-out').innerHTML = errBox(e); st.textContent = ''; }
  prog.hidden = true; $('#mi-run').disabled = false;
});
const METHOD = { pmm: 'Emparejamiento por media predictiva (PMM)', logreg: 'Regresión logística', polyreg: 'Logística multinomial' };
function renderMI() {
  const M = state.mi;
  const tbl = `<table class="data"><thead><tr><th>Variable</th><th class="num">Perdidos</th><th>Método</th></tr></thead><tbody>${M.target.map(v => `<tr><td>${esc(v)}</td><td class="num">${M.missIdx[v].length}</td><td>${METHOD[M.method[v]]}</td></tr>`).join('')}</tbody></table>`;
  const tr = M.target.map(v => figWrap(tracePlot(M.trace, v, state.meta[v].type === 'num'), `convergencia_${v}`)).join('');
  const strip = M.target.map(v => {
    const obs = Array.from(state.ds.cols[v]).filter(x => !isMiss(x));
    if (state.meta[v].type === 'num') return figWrap(stripPlot(obs, M.imps.slice(0, 20).map(d => M.missIdx[v].map(i => d.cols[v][i])), v), `imputados_${v}`);
    const ref = state.meta[v].ref, prop = a => a.filter(x => x !== ref).length / a.length;
    return figWrap(catImpPlot(prop(obs), M.imps.slice(0, 20).map(d => prop(M.missIdx[v].map(i => d.cols[v][i]))), v), `imputados_${v}`);
  }).join('');
  $('#mi-out').innerHTML = `<div class="tablewrap">${tbl}</div><h3>Convergencia (media de los valores imputados por cadena)</h3><p class="muted small">Las cadenas deben mezclarse sin tendencia. Si hay tendencia, aumente las iteraciones.</p><div class="plots">${tr}</div><h3>Valores observados (azul) vs imputados (rojo)</h3><p class="muted small">Bajo MAR los imputados pueden diferir de los observados, pero deben ser plausibles.</p><div class="plots">${strip}</div>`;
  bindFigs($('#mi-out'));
}
$('#mi-dl').addEventListener('click', () => {
  const M = state.mi, cols = Object.keys(state.meta).filter(c => state.ds.cols[c]), rows = [];
  M.imps.forEach((d, k) => { for (let i = 0; i < d.n; i++) { const r = { '.imp': k + 1, '.id': i + 1 }; cols.forEach(c => { const x = d.cols[c][i]; r[c] = isMiss(x) ? '' : x; }); rows.push(r); } });
  download(`${state.fname || 'datos'}_imputados_m${M.m}.csv`, toCSV(rows, ['.imp', '.id', ...cols]), 'text/csv');
});

// ---------------- especificación del modelo ----------------
$$('#types button').forEach(b => b.addEventListener('click', () => { state.type = b.dataset.type; renderSpecForm(); }));
function sel(id, label, vars, cur, { none = false, hint = '' } = {}) {
  return `<label>${label}${hint ? ` <span class="sub">${hint}</span>` : ''}<select id="${id}">${none ? opt('', '— ninguna —', !cur) : ''}${vars.map(v => opt(v, v, v === cur)).join('')}</select></label>`;
}
function renderSpecForm(keep = true) {
  if (!state.ds) return;
  const t = state.type, sp = (keep && state.spec && state.spec.type === t ? state.spec : state.spec && keep ? { ...state.spec, type: t } : { type: t }) || { type: t };
  $$('#types button').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  const num = usable('num'), cat = usable('cat'), anyv = usable('num', 'cat'), ids = usable('id', 'cat', 'num');
  let h = '<div class="spec-grid">';
  const yC = t === 'linear' || t === 'lmm' ? num : t === 'logistic' ? cat : t === 'poisson' ? [...cat, ...num] : t === 'gee' ? [...num, ...cat] : [];
  if (t === 'cox') {
    h += sel('sp-time', 'Tiempo de seguimiento', num, sp.time) + sel('sp-status', 'Indicador de evento', [...cat, ...num.filter(v => state.meta[v].nDistinct === 2)], sp.status);
    h += `<label>Categoría que indica el evento<select id="sp-event"></select></label>`;
  } else {
    h += sel('sp-y', 'Desenlace (variable dependiente)', yC, sp.y);
    h += `<label id="sp-event-wrap">Categoría de evento<select id="sp-event"></select></label>`;
  }
  if (t === 'gee' || t === 'lmm') h += sel('sp-id', 'Identificador del sujeto', ids, sp.id ?? usable('id')[0]) + sel('sp-tvar', 'Variable de tiempo / visita', num, sp.tvar);
  h += sel('sp-exp', 'Exposición principal', anyv, sp.exposure, { none: true, hint: '(primera en la tabla)' });
  if (t === 'linear') h += `<label>Errores estándar<select id="sp-robust">${opt('none', 'Clásicos (MCO)', sp.robust === 'none')}${opt('HC3', 'Robustos HC3', sp.robust === 'HC3')}${opt('HC1', 'Robustos HC1 (Stata)', sp.robust === 'HC1')}${opt('HC0', 'Robustos HC0', sp.robust === 'HC0')}</select></label>`;
  if (t === 'poisson') h += `<label>Medida de asociación<select id="sp-measure">${opt('RP', 'Razón de prevalencias (transversal)', sp.measureLabel === 'RP')}${opt('RR', 'Riesgo relativo (cohorte)', sp.measureLabel === 'RR')}${opt('RTI', 'Razón de tasas (conteos con offset)', sp.measureLabel === 'RTI')}</select></label>` + sel('sp-offset', 'Offset (persona-tiempo; se usa su logaritmo)', num, sp.offset, { none: true });
  if (t === 'gee') h += `<label>Familia / enlace<select id="sp-family">${opt('gaussian', 'Gaussiana · identidad (β)', sp.family === 'gaussian')}${opt('binomial', 'Binomial · logit (OR)', sp.family === 'binomial')}${opt('poisson', 'Poisson · log (RR/RP robusta)', sp.family === 'poisson')}</select></label><label>Correlación de trabajo<select id="sp-corstr">${opt('exchangeable', 'Intercambiable', sp.corstr === 'exchangeable')}${opt('ar1', 'Autorregresiva AR(1)', sp.corstr === 'ar1')}${opt('independence', 'Independencia', sp.corstr === 'independence')}</select></label>`;
  const srcMI = !!state.mi;
  h += `<label>Datos perdidos<select id="sp-source">${opt('cc', 'Casos completos', state.source === 'cc')}${opt('simple', 'Imputación simple (media/moda)', state.source === 'simple')}${srcMI ? opt('mi', `Imputación múltiple (MICE, m = ${state.mi.m})`, state.source === 'mi') : ''}</select></label>`;
  h += `<div class="wide"><b class="small">Covariables (ajuste)</b><div id="sp-covs" class="checks"></div></div>`;
  h += `<div class="wide"><b class="small">Interacciones</b> <span class="sub">(modificación de efecto)</span><div class="row gap wrap mt"><select id="sp-ia">${anyv.map(v => opt(v)).join('')}</select>×<select id="sp-ib">${anyv.map(v => opt(v)).join('')}</select><button id="sp-iadd" class="ghost" type="button">Añadir</button></div><div class="inter-list" id="sp-ilist"></div></div>`;
  h += '</div><div class="row gap mt"><button id="sp-run" class="primary">Ejecutar análisis</button><span id="sp-msg" class="muted small"></span></div>';
  $('#spec-form').innerHTML = h;
  if (sp.family == null && t === 'gee') { const yv = $('#sp-y')?.value; if (yv && state.meta[yv].type === 'cat') $('#sp-family').value = 'binomial'; }
  if (state.source === 'mi' && !srcMI) state.source = 'cc';
  const refreshEvent = () => {
    const v = t === 'cox' ? $('#sp-status').value : $('#sp-y').value, m = state.meta[v], wrap = $('#sp-event-wrap');
    const show = m && m.type === 'cat'; if (wrap) wrap.hidden = !show;
    $('#sp-event').innerHTML = show ? m.levels.map(l => opt(l, l, l === m.event)).join('') : '';
    if (t === 'gee' && m) $('#sp-family').value = m.type === 'cat' ? ($('#sp-family').value === 'gaussian' ? 'binomial' : $('#sp-family').value) : $('#sp-family').value === 'binomial' ? 'gaussian' : $('#sp-family').value;
  };
  const refreshCovs = () => {
    const excl = new Set([$('#sp-y')?.value, $('#sp-time')?.value, $('#sp-status')?.value, $('#sp-id')?.value, $('#sp-exp').value, $('#sp-offset')?.value].filter(Boolean));
    const cur = checked($('#sp-covs')).length ? checked($('#sp-covs')) : sp.covs || [];
    checks($('#sp-covs'), anyv.filter(v => !excl.has(v)), cur.filter(v => !excl.has(v)), 'covs');
  };
  ['#sp-y', '#sp-status'].forEach(s => $(s)?.addEventListener('change', () => { refreshEvent(); refreshCovs(); }));
  ['#sp-exp', '#sp-time', '#sp-id', '#sp-offset'].forEach(s => $(s)?.addEventListener('change', refreshCovs));
  $('#sp-event').addEventListener('change', e => { const v = t === 'cox' ? $('#sp-status').value : $('#sp-y').value; state.meta[v].event = e.target.value; });
  $('#sp-source').addEventListener('change', e => (state.source = e.target.value));
  refreshEvent(); checks($('#sp-covs'), [], [], 'covs'); refreshCovs();
  state.inter = (sp.inter || state.inter || []).filter(p => p.every(v => state.meta[v]));
  const drawInter = () => { $('#sp-ilist').innerHTML = state.inter.map((p, k) => `<span>${esc(p.join(' × '))}<button data-k="${k}" title="Quitar">✕</button></span>`).join(''); $$('#sp-ilist button').forEach(b => b.addEventListener('click', () => { state.inter.splice(+b.dataset.k, 1); drawInter(); })); };
  drawInter();
  $('#sp-iadd').addEventListener('click', () => { const a = $('#sp-ia').value, b = $('#sp-ib').value; if (a && b && a !== b && !state.inter.some(p => p.includes(a) && p.includes(b))) state.inter.push([a, b]); drawInter(); });
  $('#sp-run').addEventListener('click', () => run());
}
function readSpec() {
  const t = state.type, g = id => $(id)?.value || null;
  const sp = { type: t, y: g('#sp-y'), time: g('#sp-time'), status: g('#sp-status'), id: g('#sp-id'), tvar: g('#sp-tvar'), exposure: g('#sp-exp'), covs: checked($('#sp-covs')), inter: state.inter.map(p => [...p]), robust: g('#sp-robust') || 'none', measureLabel: g('#sp-measure'), offset: g('#sp-offset'), family: g('#sp-family'), corstr: g('#sp-corstr') };
  if (t === 'cox') sp.y = null; else { sp.time = sp.status = null; }
  const ev = g('#sp-event'), ov = t === 'cox' ? sp.status : sp.y; if (ev && state.meta[ov]?.type === 'cat') state.meta[ov].event = ev;
  // las variables de la interacción deben estar en el modelo
  sp.inter.flat().forEach(v => { if (v !== sp.exposure && !sp.covs.includes(v)) sp.covs.push(v); });
  sp.numVars = [sp.exposure, ...sp.covs].filter(v => v && state.meta[v].type === 'num');
  if (!sp.exposure && !sp.covs.length) throw new Error('Elija una exposición o al menos una covariable.');
  if (t !== 'cox' && !sp.y) throw new Error('Elija el desenlace.');
  if (t === 'cox' && (!sp.time || !sp.status)) throw new Error('Elija el tiempo y el indicador de evento.');
  if ((t === 'gee' || t === 'lmm') && !sp.id) throw new Error('Elija el identificador del sujeto.');
  if (t === 'poisson' && state.meta[sp.y].type === 'num' && Array.from(state.ds.cols[sp.y]).some(v => isFinite(v) && (v < 0 || !Number.isInteger(v)))) throw new Error('Poisson requiere un desenlace binario o un conteo entero ≥ 0.');
  return sp;
}
function dataSets(spec) {
  if (state.source === 'mi' && state.mi) {
    const lack = modelVars(spec).filter(v => !state.mi.vars.includes(v) && missCount(state.ds.cols[v]) > 0);
    if (lack.length) throw new Error(`Variables del modelo con perdidos que no se incluyeron en la imputación: ${lack.join(', ')}. Inclúyalas en MICE (paso 2) o use casos completos.`);
    return state.mi.imps;
  }
  if (state.source === 'simple') return [simpleImpute(state.ds, state.meta, modelVars(spec))];
  return [state.ds];
}

// ---------------- ejecución y resultados ----------------
async function run() {
  const out = $('#model-out'); $('#sp-msg').textContent = 'Calculando…'; await tick();
  try {
    const spec = readSpec(), sets = dataSets(spec);
    state.spec = spec; state.sets = sets;
    const R = runAnalysis(spec, state.meta, sets); state.R = R; state.sel = null; state.cmpSel = null;
    renderResults(R); gate();
    $('#sp-msg').textContent = `✓ n = ${R.n}`;
  } catch (e) { console.error(e); out.innerHTML = errBox(e); $('#sp-msg').textContent = ''; }
}
function renderResults(R) {
  const spec = R.spec, M = R.M, out = $('#model-out'), N = state.ds.n, title = `${TYPES[spec.type].label}${spec.type === 'gee' ? ` (${spec.family}, ${spec.corstr})` : ''}`;
  const yv = spec.type === 'cox' ? spec.status : spec.y, ym = state.meta[yv];
  const nev = ym && ym.type === 'cat' ? R.rows.filter(i => state.sets[0].cols[yv][i] === ym.event).length : null;
  const src = { cc: 'casos completos', simple: 'imputación simple (media/moda)', mi: `imputación múltiple (m = ${R.m}, reglas de Rubin)` }[state.source];
  let h = card(`Resultados · ${esc(title)}`, `<p class="small">Desenlace: <b>${esc(yv)}</b>${nev != null ? ` (evento = «${esc(ym.event)}»: ${nev} de ${R.n}, ${pct(nev / R.n)})` : ''} · n analizado = <b>${R.n}</b> de ${N} filas${state.source === 'cc' && R.n < N ? ` (${N - R.n} excluidas por datos perdidos)` : ''} · datos: ${src}.</p>
    <div class="row gap"><label class="inline"><input type="checkbox" id="show-crude" checked> Mostrar modelo crudo</label><span class="grow"></span><button class="ghost" id="tab-doc">Tabla en Word</button><button class="ghost" id="tab-csv">Tabla en CSV</button></div>
    <div id="forest"></div><p class="notes">Crudo: cada variable en un modelo separado. Ajustado: todas las variables en un mismo modelo. ${M.exp ? `Escala logarítmica; línea de no efecto en ${M.measure} = 1.` : 'Línea de no efecto en β = 0.'} p global: prueba de Wald conjunta para variables con más de 2 categorías.${spec.inter.length ? ' Con interacciones, el efecto principal de una variable corresponde a la categoría de referencia (o al valor 0) de la otra.' : ''}</p>`);
  // coeficientes
  const est = R.adj.est, D = R.adj.D, mi = R.mi;
  h += card('Coeficientes del modelo ajustado', `<div class="tablewrap"><table class="data"><thead><tr><th>Término</th><th class="num">β</th><th class="num">EE${spec.type === 'linear' && spec.robust !== 'none' ? ` (${spec.robust})` : spec.type === 'poisson' || spec.type === 'gee' ? ' robusto' : ''}</th><th class="num">${isFinite(est.df) && !mi ? 't' : mi ? 't' : 'z'}</th><th class="num">p</th><th class="num">${M.measure} (IC 95%)</th>${mi ? '<th class="num">gl</th><th class="num">FMI</th>' : ''}</tr></thead><tbody>${D.cols.map((c, j) => { const [lo, hi] = coefCI(est, j), tr = M.exp && c.term !== '(Intercept)' ? Math.exp : v => v; return `<tr><td>${esc(c.label)}</td><td class="num">${f2(est.beta[j], 4)}</td><td class="num">${f2(est.se[j], 4)}</td><td class="num">${f2(est.stat[j])}</td><td class="num">${fp(est.p[j])}</td><td class="num">${c.term === '(Intercept)' ? '' : `${f2(tr(est.beta[j]))} (${f2(tr(lo))}–${f2(tr(hi))})`}</td>${mi ? `<td class="num">${f2(est.dfj[j], 1)}</td><td class="num">${f2(est.fmi[j], 3)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
    <div class="kpis">${fitStats(R).map(([k, v]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>${mi ? '<p class="notes">FMI: fracción de información perdida. gl: grados de libertad de Barnard-Rubin.</p>' : ''}`);
  // supuestos
  let A; try { A = assumptions(spec, R.adj); } catch (e) { A = { checks: [], extra: {}, err: e.message }; }
  h += card(`Evaluación de supuestos${mi ? ' <span class="sub">(en la imputación 1)</span>' : ''}`, `${A.err ? errBox(A.err) : ''}<table class="data chk"><tbody>${A.checks.map(c => `<tr><td class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '⚠'}</td><td><b>${esc(c.name)}</b><br><span class="sub">${esc(c.value)}</span></td><td>${esc(c.note)}</td></tr>`).join('')}</tbody></table>
    <details class="mt"><summary>Colinealidad por término (GVIF)</summary><table class="data"><thead><tr><th>Término</th><th class="num">GVIF</th><th class="num">gl</th><th class="num">GVIF^(1/(2·gl))</th></tr></thead><tbody>${(A.extra.vif || []).map(v => `<tr><td>${esc(v.term)}</td><td class="num">${f2(v.gvif)}</td><td class="num">${v.df}</td><td class="num">${f2(v.adj)}</td></tr>`).join('')}</tbody></table></details>
    <div class="plots mt" id="diag-plots"></div>${spec.type === 'gee' ? '<div id="qic"></div>' : ''}`);
  if (spec.type === 'cox') h += card('Kaplan-Meier y log-rank', '<div id="km"></div>');
  if (spec.type === 'gee' || spec.type === 'lmm') h += card('Trayectorias en el tiempo', '<div class="plots" id="long-plots"></div>');
  if (mi && state.mi) h += card('Sensibilidad a datos perdidos no al azar (MNAR): ajuste δ', `<p class="muted small">Disponible para variables imputadas cuantitativas o binarias (del modelo o auxiliares). Se repite la imputación desplazando los valores imputados de una variable en δ (cuantitativas: en sus unidades; binarias: en log-odds) para representar que quienes no tienen el dato difieren sistemáticamente de lo predicho bajo MAR (patrón-mezcla; van Buuren 2018, cap. 3.8). Si la conclusión cambia con δ plausibles, los resultados son sensibles a MNAR.</p>
    <div class="form"><label>Variable <select id="d-var">${state.mi.target.filter(v => state.meta[v].type === 'num' || state.meta[v].levels.length === 2).map(v => opt(v)).join('')}</select></label><label>Valores de δ (separados por coma) <input id="d-vals"></label><label>Imputaciones por δ <input id="d-m" type="number" value="${Math.min(10, state.mi.m)}"></label></div>
    <div class="row gap mt"><button class="primary" id="d-run">Ejecutar</button><span id="d-msg" class="muted small"></span></div><div id="d-out"></div>`);
  out.innerHTML = h;
  const drawForest = () => { $('#forest').innerHTML = figWrap(forestTable({ rows: R.table, measure: M.measure, exp: M.exp, showCrude: $('#show-crude').checked, cLabel: 'Modelo crudo', aLabel: 'Modelo ajustado' }), `forest_${spec.type}`); bindFigs($('#forest')); };
  drawForest(); $('#show-crude').addEventListener('change', drawForest);
  $('#tab-doc').addEventListener('click', () => exportTable('doc')); $('#tab-csv').addEventListener('click', () => exportTable('csv'));
  try { diagPlots(R, A); } catch (e) { $('#diag-plots').innerHTML = errBox(e); }
  if (spec.type === 'cox') kmSection(R);
  if (spec.type === 'gee' || spec.type === 'lmm') longPlots(R);
  if (spec.type === 'gee') qicTable(R);
  if (mi && state.mi && $('#d-var')) { const setDef = () => { const v = $('#d-var').value; if (!v) return; const m = state.meta[v]; const s = m.type === 'num' ? sd(Array.from(state.ds.cols[v]).filter(isFinite)) : 1; $('#d-vals').value = (m.type === 'num' ? [-1, -0.5, -0.25, 0, 0.25, 0.5, 1].map(k => +(k * s).toPrecision(3)) : [-2, -1, -0.5, 0, 0.5, 1, 2]).join(', '); }; setDef(); $('#d-var').addEventListener('change', setDef); $('#d-run').addEventListener('click', deltaRun); }
  bindFigs(out);
}
function exportTable(kind) {
  const R = state.R, show = $('#show-crude')?.checked ?? true, Mx = resultsMatrix(R, show), name = `Tabla_${R.spec.type}`;
  if (kind === 'csv') return download(`${name}.csv`, matrixCSV(Mx), 'text/csv');
  download(`${name}.doc`, wordDoc(`Tabla. Factores asociados a ${R.spec.y || R.spec.status}: ${TYPES[R.spec.type].label.toLowerCase()} (${R.M.long})`, matrixHTML(Mx), `${R.M.measure}: ${R.M.long}; IC 95%: intervalo de confianza al 95%. Modelo ajustado por todas las variables de la tabla. n = ${R.n}.`), 'application/msword');
}
function diagPlots(R, A) {
  const spec = R.spec, f = R.adj.fit, el = $('#diag-plots'), F = [];
  if (spec.type === 'linear' || spec.type === 'lmm') {
    const rs = spec.type === 'linear' ? f.rstd : (() => { const c = Array.from(f.cond), s = sd(c); return c.map(v => v / s); })();
    F.push(figWrap(scatterPlot({ x: f.fitted, y: rs, xlab: 'Valores ajustados', ylab: spec.type === 'linear' ? 'Residuo estandarizado' : 'Residuo condicional estandarizado', title: 'Residuos vs ajustados', hline: 0, smooth: lowess(f.fitted, rs) }), 'residuos_vs_ajustados'));
    F.push(figWrap(qqPlot(rs), 'qq_residuos'));
    F.push(figWrap(histPlot(rs, { xlab: 'Residuo', title: 'Distribución de residuos' }), 'histograma_residuos'));
    if (spec.type === 'linear') F.push(figWrap(cookPlot(f.cook), 'cook'));
  }
  if (spec.type === 'logistic') {
    F.push(figWrap(rocPlot(A.extra.roc, `AUC = ${f2(A.extra.auc.auc, 3)}`), 'roc'));
    F.push(figWrap(calibPlot(A.extra.hl), 'calibracion'));
    F.push(figWrap(cookPlot(f.cook), 'cook'));
  }
  if (spec.type === 'poisson') {
    F.push(figWrap(scatterPlot({ x: f.fitted, y: f.pres, xlab: 'Valores ajustados', ylab: 'Residuo de Pearson', title: 'Residuos de Pearson vs ajustados', hline: 0, smooth: lowess(f.fitted, f.pres) }), 'residuos_pearson'));
    F.push(figWrap(cookPlot(f.cook), 'cook'));
  }
  if (spec.type === 'cox' && A.extra.zph) {
    const z = A.extra.zph; R.adj.D.cols.slice(0, 8).forEach((c, j) => F.push(figWrap(schoenfeldPlot(z, j, c.label, lowess(z.times, z.scaled.map(r => r[j]))), `schoenfeld_${c.label}`)));
  }
  if (spec.type === 'gee') F.push(figWrap(scatterPlot({ x: f.fitted, y: f.resid, xlab: 'Valores ajustados', ylab: 'Residuo', title: 'Residuos vs ajustados', hline: 0, smooth: lowess(f.fitted, f.resid) }), 'residuos_gee'));
  // linealidad para cuantitativas: residuos parciales frente a cada predictor numérico
  if (['linear', 'logistic', 'poisson'].includes(spec.type)) spec.numVars.slice(0, 3).forEach(v => {
    const j = R.adj.D.cols.findIndex(c => c.term === v), x = R.adj.D.X.map(r => r[j]);
    const res = spec.type === 'linear' ? f.resid : Array.from(f.resid, (r, i) => r / (spec.type === 'logistic' ? f.fitted[i] * (1 - f.fitted[i]) : f.fitted[i]));
    const pr = x.map((xi, i) => res[i] + f.beta[j] * xi);
    F.push(figWrap(scatterPlot({ x, y: pr, xlab: v, ylab: 'Residuo parcial', title: `Linealidad: ${v} (residuos parciales)`, smooth: lowess(x, pr), line: [[Math.min(...x), f.beta[j] * Math.min(...x)], [Math.max(...x), f.beta[j] * Math.max(...x)]] }), `linealidad_${v}`));
  });
  el.innerHTML = F.join('');
}
function kmSection(R) {
  const spec = R.spec, ds = state.sets[0], rows = R.rows, t = rows.map(i => ds.cols[spec.time][i]), ev = state.meta[spec.status], s = rows.map(i => (String(ds.cols[spec.status][i]) === String(ev.event) ? 1 : 0));
  const E = spec.exposure && state.meta[spec.exposure].type === 'cat' ? spec.exposure : null;
  let curves, ptxt = '', lr = null;
  if (E) {
    const L = levelsOf(state.meta[E]); curves = L.map(l => { const ix = rows.map((i, k) => k).filter(k => ds.cols[E][rows[k]] === l); return { label: l, k: km(ix.map(k => t[k]), ix.map(k => s[k])) }; }).filter(c => c.k.n);
    lr = logrank(t, s, rows.map(i => ds.cols[E][i])); ptxt = `Log-rank: χ² = ${f2(lr.chisq)}, gl = ${lr.df}, ${lr.p < 0.001 ? 'p < 0.001' : 'p = ' + fp(lr.p)}`;
  } else curves = [{ label: 'Total', k: km(t, s) }];
  $('#km').innerHTML = figWrap(kmPlot(curves, { xlab: spec.time, pTxt: ptxt, title: `Kaplan-Meier${E ? ` según ${E}` : ''}` }), 'kaplan_meier') +
    `<table class="data"><thead><tr><th>Grupo</th><th class="num">n</th><th class="num">Eventos</th><th class="num">Mediana (IC 95%)</th>${lr ? '<th class="num">Observados</th><th class="num">Esperados</th>' : ''}</tr></thead><tbody>${curves.map((c, g) => `<tr><td>${esc(c.label)}</td><td class="num">${c.k.n}</td><td class="num">${c.k.events}</td><td class="num">${isFinite(c.k.median) ? `${f2(c.k.median, 1)} (${f2(c.k.medianCI[0], 1)}–${isFinite(c.k.medianCI[1]) ? f2(c.k.medianCI[1], 1) : 'NE'})` : 'no alcanzada'}</td>${lr ? `<td class="num">${lr.O[lr.levels.indexOf(c.label)]}</td><td class="num">${f2(lr.E[lr.levels.indexOf(c.label)], 1)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  bindFigs($('#km'));
}
function longPlots(R) {
  const spec = R.spec, ds = state.sets[0], rows = R.rows, E = spec.exposure && state.meta[spec.exposure].type === 'cat' ? spec.exposure : null, ym = state.meta[spec.y];
  const yv = i => (ym.type === 'cat' ? (ds.cols[spec.y][i] === ym.event ? 1 : 0) : ds.cols[spec.y][i]);
  const groups = (E ? levelsOf(state.meta[E]) : ['Total']).map(l => {
    const ix = rows.filter(i => !E || ds.cols[E][i] === l), times = [...new Set(ix.map(i => ds.cols[spec.tvar]?.[i]))].filter(isFinite).sort((a, b) => a - b);
    return { label: l, pts: times.map(tt => { const v = ix.filter(i => ds.cols[spec.tvar][i] === tt).map(yv), m = mean(v), se = v.length > 1 ? sd(v) / Math.sqrt(v.length) : 0, q = v.length > 1 ? qt(0.975, v.length - 1) : 0; return { x: tt, m, lo: m - q * se, hi: m + q * se }; }) };
  });
  let h = spec.tvar ? figWrap(profilePlot(groups, { xlab: spec.tvar, ylab: ym.type === 'cat' ? `Proporción ${spec.y} = ${ym.event}` : spec.y }), 'perfil_medio') : '';
  if (ym.type === 'num' && spec.tvar) {
    const by = new Map(); rows.forEach(i => { const id = ds.cols[spec.id][i]; if (!by.has(id)) by.set(id, { g: E ? ds.cols[E][i] : 'Total', pts: [] }); by.get(id).pts.push([ds.cols[spec.tvar][i], ds.cols[spec.y][i]]); });
    h += figWrap(spaghettiPlot([...by.values()].map(l => ({ ...l, pts: l.pts.sort((a, b) => a[0] - b[0]) })), { xlab: spec.tvar, ylab: spec.y }), 'trayectorias');
  }
  $('#long-plots').innerHTML = h || '<p class="muted">Elija una variable de tiempo para ver los perfiles.</p>'; bindFigs($('#long-plots'));
}
function qicTable(R) {
  const rows = ['independence', 'exchangeable', 'ar1'].map(cs => { try { const r = fitModel({ ...R.spec, corstr: cs }, state.sets[0], state.meta, termsOf(R.spec), R.rows); return { cs, qic: r.fit.qic, qicu: r.fit.qicu, a: r.fit.alpha }; } catch (e) { return { cs, err: e.message }; } });
  const best = rows.filter(r => isFinite(r.qic)).sort((a, b) => a.qic - b.qic)[0]?.cs;
  $('#qic').innerHTML = `<h3>Elección de la correlación de trabajo (QIC, Pan 2001)</h3><table class="data"><thead><tr><th>Estructura</th><th class="num">α</th><th class="num">QIC</th><th class="num">QICu</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.cs}${r.cs === best ? ' <span class="flag">menor QIC</span>' : ''}</td><td class="num">${f2(r.a, 3)}</td><td class="num">${f2(r.qic, 1)}</td><td class="num">${f2(r.qicu, 1)}</td></tr>`).join('')}</tbody></table>`;
}
async function deltaRun() {
  const R = state.R, spec = R.spec, v = $('#d-var').value, vals = $('#d-vals').value.split(',').map(Number).filter(isFinite), m = Math.max(2, +$('#d-m').value || 5);
  if (!v) { $('#d-out').innerHTML = errBox('No hay variables imputadas cuantitativas o binarias.'); return; }
  const E = spec.exposure; if (!E) { $('#d-out').innerHTML = errBox('Defina una exposición principal.'); return; }
  const msg = $('#d-msg'), pts = [];
  for (const [k, d] of vals.entries()) {
    msg.textContent = `δ = ${d} (${k + 1}/${vals.length})…`; await tick();
    try {
      const mi = await mice(state.ds, state.meta, { vars: state.mi.vars, m, maxit: state.mi.maxit, seed: state.mi.seed, delta: { v, value: d } });
      const P = fitPooled(spec, mi.imps, state.meta, termsOf(spec), R.rows), j = P.D.cols.findIndex(c => c.term === E);
      const [lo, hi] = coefCI(P.est, j), tr = R.M.exp ? Math.exp : x => x;
      pts.push({ delta: d, est: tr(P.est.beta[j]), lo: tr(lo), hi: tr(hi), p: P.est.p[j], label: P.D.cols[j].label });
    } catch (e) { $('#d-out').innerHTML = errBox(e); return; }
  }
  msg.textContent = ''; state.delta = true;
  const flip = pts.filter(p => p.p < 0.05).length, lab = pts[0]?.label;
  $('#d-out').innerHTML = figWrap(tippingPlot(pts, { xlab: `δ aplicado a los imputados de ${v}`, measure: `${R.M.measure} de ${lab}`, exp: R.M.exp }), 'sensibilidad_delta') + `<table class="data"><thead><tr><th class="num">δ</th><th class="num">${R.M.measure} (IC 95%)</th><th class="num">p</th></tr></thead><tbody>${pts.map(p => `<tr><td class="num">${p.delta}</td><td class="num">${f2(p.est)} (${f2(p.lo)}–${f2(p.hi)})</td><td class="num">${fp(p.p)}</td></tr>`).join('')}</tbody></table><p class="small">${flip === pts.length ? 'La asociación se mantiene significativa en todo el rango de δ: conclusión robusta a MNAR en ese rango.' : flip === 0 ? 'La asociación no es significativa en ningún escenario.' : 'La significancia cambia dentro del rango de δ: la conclusión es sensible a supuestos MNAR (punto de inflexión).'} Círculos rellenos: p < 0.05.</p>`;
  bindFigs($('#d-out'));
}

// ---------------- modelización multivariable ----------------
function selData() { return { ds: state.sets[0], rows: state.R.rows }; }
function renderSelCtx() {
  if (!state.R) return; const s = state.R.spec;
  $('#sel-ctx').innerHTML = `Modelo del paso 3: <b>${esc(TYPES[s.type].label)}</b>; desenlace <b>${esc(s.y || s.status)}</b>; exposición forzada <b>${esc(s.exposure || '—')}</b>; ${s.covs.length} covariables candidatas (${esc(s.covs.join(', '))}). Muestra: n = ${state.R.n}${state.R.mi ? ' (selección realizada en la imputación 1)' : ''}.`;
  renderCompare();
}
$('#sel-run').addEventListener('click', () => {
  const spec = { ...state.R.spec, inter: [] }, { ds, rows } = selData(), st = $('#sel-strategy').value, o = $('#sel-out');
  try {
    const r = st === 'purposeful' ? purposeful(spec, ds, state.meta, rows, { pEnter: +$('#sel-pin').value, pStay: +$('#sel-pout').value, delta: +$('#sel-delta').value })
      : backward(spec, ds, state.meta, rows, { by: st, pOut: +$('#sel-pout').value });
    state.sel = { ...r, strategy: st };
    o.innerHTML = `<ol class="log">${r.log.map(l => `<li>${esc(l.text)}${l.table ? `<table class="data mt"><thead><tr><th>Variable</th><th class="num">p bivariado</th><th></th></tr></thead><tbody>${l.table.map(t => `<tr><td>${esc(t[0])}</td><td class="num">${t[1]}</td><td>${t[2]}</td></tr>`).join('')}</tbody></table>` : ''}</li>`).join('')}</ol><p><b>Covariables seleccionadas:</b> ${esc(r.covs.join(', ') || 'ninguna')}</p>`;
    $('#sel-apply').hidden = false; renderCompare();
  } catch (e) { o.innerHTML = errBox(e); }
});
$('#sel-apply').addEventListener('click', () => {
  if (!state.sel) return;
  state.spec = { ...state.R.spec, covs: state.sel.covs, inter: state.R.spec.inter.filter(p => p.every(v => v === state.R.spec.exposure || state.sel.covs.includes(v))) };
  state.selection = { purposeful: 'la estrategia de selección intencionada de Hosmer y Lemeshow (Bursac et al. 2008)', aic: 'una eliminación hacia atrás por AIC', p: 'una eliminación hacia atrás por valor p' }[state.sel.strategy];
  renderSpecForm(); showTab('modelos'); run();
});
$('#cie-run').addEventListener('click', () => {
  const spec = { ...state.R.spec, inter: [] }, { ds, rows } = selData(), o = $('#cie-out');
  if (!spec.exposure) { o.innerHTML = errBox('Defina una exposición principal en el paso 3.'); return; }
  try {
    const r = changeInEstimate(spec, ds, state.meta, rows, +$('#cie-thr').value || 0.1), M = measureOf(spec);
    o.innerHTML = `<p class="small">${M.measure} de ${esc(spec.exposure)}: crudo ${r.crude.map(e => `${esc(e.label)} = ${f2(e.est)}`).join('; ')} · ajustado completo ${r.full.map(e => `${esc(e.label)} = ${f2(e.est)}`).join('; ')}.</p><table class="data"><thead><tr><th>Covariable retirada</th><th>${M.measure} de la exposición sin ella</th><th class="num">Cambio máx.</th><th>Juicio</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.v)}</td><td>${x.effects.map(e => `${esc(e.label)}: ${f2(e.est)}`).join('; ')}</td><td class="num">${pct(x.max)}</td><td>${x.conf ? '<span class="flag">confusor</span>' : '—'}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { o.innerHTML = errBox(e); }
});
$('#em-run').addEventListener('click', () => {
  const spec = { ...state.R.spec, inter: [] }, { ds, rows } = selData(), o = $('#em-out'), M = measureOf(spec);
  if (!spec.exposure) { o.innerHTML = errBox('Defina una exposición principal en el paso 3.'); return; }
  try {
    const r = effectModification(spec, ds, state.meta, rows);
    o.innerHTML = `<table class="data"><thead><tr><th>Exposición × covariable</th><th class="num">p interacción</th><th>${M.measure} de la exposición por estrato (IC 95%)</th><th></th></tr></thead><tbody>${r.map((x, k) => x.error ? `<tr><td>${esc(spec.exposure)} × ${esc(x.v)}</td><td colspan="3" class="sub">no estimable: ${esc(x.error)}</td></tr>` : `<tr><td>${esc(spec.exposure)} × ${esc(x.v)}</td><td class="num${x.p < 0.05 ? ' b' : ''}">${fp(x.p)}</td><td class="sub">${x.strata.map(s => `${esc(s.stratum)} · ${esc(s.exposure)}: ${!isFinite(s.est) || !isFinite(s.hi) || (M.exp ? s.hi / s.lo > 1e3 : false) ? '<i>no estimable (celdas con pocos o ningún evento)</i>' : `${f2(s.est)} (${f2(s.lo)}–${f2(s.hi)})`}`).join('<br>')}</td><td><button class="ghost" data-add="${esc(x.v)}">Añadir al modelo</button></td></tr>`).join('')}</tbody></table><p class="notes">Valores p < 0.05 (o < 0.10–0.20 con poca potencia) sugieren modificación de efecto; interprete en conjunto con la plausibilidad clínica.</p>`;
    o.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { state.spec = { ...state.R.spec, inter: [...state.R.spec.inter, [spec.exposure, b.dataset.add]] }; state.inter = state.spec.inter; renderSpecForm(); showTab('modelos'); run(); }));
  } catch (e) { o.innerHTML = errBox(e); }
});
function renderCompare() {
  const s = { ...state.R.spec, inter: [] }, { ds, rows } = selData(), models = [['Crudo (solo exposición)', s.exposure ? [] : null], ['Completo (todas las covariables)', s.covs]];
  if (state.sel) models.push(['Seleccionado', state.sel.covs]);
  const fits = models.filter(m => m[1]).map(([name, covs]) => { try { const r = fitModel(s, ds, state.meta, termsOf(s, covs), rows); return { name, covs, r, k: r.D.X[0].length }; } catch (e) { return { name, err: e.message }; } });
  const full = fits.find(f => f.name.startsWith('Completo')), lik = ['linear', 'logistic', 'poisson', 'cox'].includes(s.type);
  const ll = f => (f.r.fit.ll), crit = f => (s.type === 'gee' ? f.r.fit.qic : f.r.fit.aic);
  $('#cmp-out').innerHTML = `<table class="data"><thead><tr><th>Modelo</th><th class="num">Parámetros</th><th class="num">${s.type === 'gee' ? 'QIC' : 'AIC'}</th>${lik ? '<th class="num">BIC</th><th class="num">LRT vs completo (p)</th>' : ''}</tr></thead><tbody>${fits.map(f => f.err ? `<tr><td>${esc(f.name)}</td><td colspan="4">${esc(f.err)}</td></tr>` : `<tr><td>${esc(f.name)}</td><td class="num">${f.k}</td><td class="num">${f2(crit(f), 1)}</td>${lik ? `<td class="num">${f2(f.r.fit.bic, 1)}</td><td class="num">${f === full || !full ? '' : (() => { const lr = 2 * (ll(full) - ll(f)), df = full.k - f.k; return df > 0 ? `${f2(lr)} (gl ${df}; p ${fp(lrP(lr, df))})` : ''; })()}</td>` : ''}</tr>`).join('')}</tbody></table><p class="notes">Menor AIC/BIC indica mejor equilibrio entre ajuste y complejidad. LRT: razón de verosimilitud del modelo completo frente al reducido (p < 0.05 indica que las covariables omitidas mejoran el ajuste).${s.type === 'linear' && s.robust !== 'none' ? '' : ''}${s.type === 'poisson' ? ' En Poisson robusta con desenlace binario, la verosimilitud es una cuasi-verosimilitud: use AIC/LRT solo de forma orientativa.' : ''}</p>`;
}
const lrP = (x, df) => pchisqU(x, df);

// ---------------- reporte ----------------
$$('[data-lang]').forEach(b => b.addEventListener('click', () => { state.lang = b.dataset.lang; renderReport(); }));
$('#meth-copy').addEventListener('click', () => { navigator.clipboard?.writeText($('#methods').value); });
$('#rep-doc').addEventListener('click', () => state.R && exportTable('doc'));
$('#rep-csv').addEventListener('click', () => state.R && exportTable('csv'));
function renderReport() {
  if (!state.R) return; const R = state.R;
  const ctx = { source: state.source, N: state.ds.n, mi: state.mi, little: state.little, delta: state.delta, selection: state.selection, event: state.meta[R.spec.y]?.event };
  $('#methods').value = methodsText(R, ctx, state.lang);
  $('#rep-table').innerHTML = `<div class="tablewrap tall">${matrixHTML(resultsMatrix(R, true)).replace('<table>', '<table class="data">')}</div>`;
}
gate();
