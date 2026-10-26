import { readFile, download, toCSV } from './io.js?v=2026.10.26-1';
import { inferMeta, typedData, NA_DEFAULT, isMiss, missCount, levelsOf, completeRows } from './data.js?v=2026.10.26-1';
import { runAnalysis, fitModel, fitPooled, termsOf, modelVars, measureOf, fitStats, coefCI, TYPES, outLevels } from './analysis.js?v=2026.10.26-1';
import { assumptions, lowess } from './diag.js?v=2026.10.26-1';
import { missingSummary, patterns, littleMCAR, compareByMissing, missingnessModel, mice, singleImpute, METHODS, methodsFor, defaultMethod } from './missing.js?v=2026.10.26-1';
import { purposeful, changeInEstimate, effectModification } from './select.js?v=2026.10.26-1';
import { km, logrank } from './models.js?v=2026.10.26-1';
import { ordinalCutpoints } from './models2.js?v=2026.10.26-1';
import { forestTable, scatterPlot, qqPlot, schoenfeldPlot, kmPlot, missBarPlot, patternPlot, tracePlot, stripPlot, catImpPlot, tippingPlot, profilePlot, spaghettiPlot, densityPlot, vifPlot, leveragePlot, binnedResidPlot, missByGroupPlot } from './plots.js?v=2026.10.26-1';
import { figWrap, bindFigs } from './figs.js?v=2026.10.26-1';
import { table1, table1HTML, resultsMatrix, matrixHTML, matrixCSV, wordDoc, methodsText } from './report.js?v=2026.10.26-1';
import { mean, sd, quantile, chisqTest } from './tests.js?v=2026.10.26-1';
import { qt, pchisqU } from './dist.js?v=2026.10.26-1';
import { qmapHTML } from './qmap.js?v=2026.10.26-1';
import { interpretExposure } from './interp.js?v=2026.10.26-1';
import { HELP_HTML } from './help.js?v=2026.10.26-1';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));
const f2 = (x, d = 2) => (isFinite(x) ? (Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(d)) : '–');
const pct = x => (isFinite(x) ? (100 * x).toFixed(1) + '%' : '–');
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label ?? v)}</option>`;
const errBox = e => `<div class="err">${esc(e.message || e)}</div>`;
const howto = (a, b, c, t = ['Qué se ve', 'Para qué', 'Cómo interpretar']) => `<div class="howto"><div><b>${t[0]}</b>${a}</div><div><b>${t[1]}</b>${b}</div><div><b>${t[2]}</b>${c}</div></div>`;
const card = (title, body) => `<div class="card"><h2>${title}</h2>${body}</div>`;
const tick = () => new Promise(r => setTimeout(r, 20));

$('#qmap').innerHTML = qmapHTML('data');
// ---------------- ejemplos de nefrología (datos simulados) ----------------
const EXAMPLES = [
  { file: 'hemodialisis_depresion.csv', title: 'Hemodiálisis · depresión', design: 'Transversal · 260 pacientes', use: 'Poisson robusta (RP), logística o lineal (PHQ-9)',
    meta: { 'Depresión': { event: 'Sí' }, 'Acceso vascular': { ref: 'Fístula arteriovenosa' }, 'Apoyo familiar': { ref: 'Adecuado' }, Diabetes: { ref: 'No' }, 'Grupo de edad': { ref: '18 a 39 años' } },
    spec: { objective: 'asociacion', type: 'poisson', measureLabel: 'RP', y: 'Depresión', exposure: 'Acceso vascular', covs: ['Edad', 'Sexo', 'Diabetes', 'Apoyo familiar', 'Hemoglobina (g/dL)', 'Albúmina (g/dL)'] } },
  { file: 'hemodialisis_mortalidad.csv', title: 'Hemodiálisis · mortalidad', design: 'Cohorte · 450 pacientes', use: 'Kaplan-Meier, log-rank y Cox (HR)',
    meta: { Fallecido: { event: 'Sí' }, 'Acceso vascular': { ref: 'Fístula arteriovenosa' }, Diabetes: { ref: 'No' } },
    spec: { objective: 'causal', type: 'cox', time: 'Tiempo de seguimiento (meses)', status: 'Fallecido', exposure: 'Acceso vascular', covs: ['Edad', 'Diabetes', 'Índice de Charlson', 'Albúmina (g/dL)'] } },
  { file: 'erc_tfge_longitudinal.csv', title: 'ERC · TFGe en el tiempo', design: 'Longitudinal · 150 pacientes × 5 visitas', use: 'Modelo mixto o GEE (iSGLT2 vs estándar)',
    meta: { 'Albuminuria A3': { event: 'Sí' }, Tratamiento: { ref: 'Tratamiento estándar' }, Diabetes: { ref: 'No' } },
    spec: { objective: 'causal', type: 'lmm', y: 'TFGe (mL/min/1.73 m²)', id: 'ID', tvar: 'Mes', exposure: 'Tratamiento', covs: ['Mes', 'Edad', 'Diabetes'], inter: [['Tratamiento', 'Mes']] } },
  { file: 'lesion_renal_aguda.csv', title: 'Lesión renal aguda poscirugía cardiaca', design: 'Cohorte · 520 pacientes', use: 'Poisson robusta (RR) o logística (OR)',
    meta: { 'LRA (KDIGO)': { event: 'Sí' }, 'Bypass prolongado (> 120 min)': { ref: 'No', event: 'Sí' }, Diabetes: { ref: 'No' }, Vasopresores: { ref: 'No' }, 'Tipo de cirugía': { ref: 'Revascularización' } },
    spec: { objective: 'causal', type: 'poisson', measureLabel: 'RR', y: 'LRA (KDIGO)', exposure: 'Bypass prolongado (> 120 min)', covs: ['Edad', 'Diabetes', 'TFGe basal (mL/min/1.73 m²)', 'Fracción de eyección (%)', 'Tipo de cirugía'] } },
  { file: 'trasplante_injerto.csv', title: 'Trasplante renal · supervivencia del injerto', design: 'Cohorte · 380 receptores', use: 'Supervivencia (Kaplan-Meier, Cox)',
    meta: { 'Pérdida del injerto': { event: 'Sí' }, 'Tipo de donante': { ref: 'Vivo' }, 'Rechazo agudo': { ref: 'No' } },
    spec: { objective: 'asociacion', type: 'cox', time: 'Tiempo de seguimiento (años)', status: 'Pérdida del injerto', exposure: 'Tipo de donante', covs: ['Edad del receptor', 'Incompatibilidades HLA', 'Rechazo agudo', 'Isquemia fría (horas)'] } },
  { file: 'dialisis_peritonitis.csv', title: 'Diálisis peritoneal · peritonitis', design: 'Cohorte · 300 pacientes · persona-tiempo', use: 'Poisson robusta con offset (razón de tasas)',
    types: { 'Episodios de peritonitis': 'num' }, meta: { 'Programa de entrenamiento': { ref: 'Convencional' }, Diabetes: { ref: 'No' } },
    spec: { objective: 'causal', type: 'poisson', measureLabel: 'RTI', y: 'Episodios de peritonitis', offset: 'Tiempo en diálisis peritoneal (años)', exposure: 'Programa de entrenamiento', covs: ['Edad', 'Diabetes', 'Albúmina (g/dL)'] } },
  { file: 'dialisis_peritonitis.csv', title: 'Diálisis peritoneal · peritonitis (conteos)', design: 'Cohorte · 300 pacientes · persona-tiempo', use: 'Poisson (varianza de Poisson) y binomial negativa; compare ambas y revise la sobredispersión',
    types: { 'Episodios de peritonitis': 'num' }, meta: { 'Programa de entrenamiento': { ref: 'Convencional' }, Diabetes: { ref: 'No' } },
    spec: { objective: 'causal', type: 'nb', y: 'Episodios de peritonitis', offset: 'Tiempo en diálisis peritoneal (años)', exposure: 'Programa de entrenamiento', covs: ['Edad', 'Diabetes', 'Albúmina (g/dL)'] } },
  { file: 'erc_utilizacion.csv', title: 'ERC · consultas de urgencias (exceso de ceros)', design: 'Cohorte · 500 pacientes · persona-tiempo', use: 'Poisson inflada en ceros (ZIP): conteo + ceros estructurales',
    types: { 'Consultas de urgencias': 'num', 'Ingresos hospitalarios': 'num' }, meta: { Diabetes: { ref: 'No' }, 'Programa de educación en ERC': { ref: 'No' }, Sexo: { ref: 'Masculino' } },
    spec: { objective: 'causal', type: 'zip', y: 'Consultas de urgencias', offset: 'Seguimiento (años)', exposure: 'Programa de educación en ERC', covs: ['Edad', 'Diabetes', 'TFGe (mL/min/1.73 m²)'] } },
  { file: 'erc_utilizacion.csv', title: 'ERC · ingresos hospitalarios (sobredispersión + ceros)', design: 'Misma base · 500 pacientes', use: 'Binomial negativa inflada en ceros (ZINB)',
    types: { 'Consultas de urgencias': 'num', 'Ingresos hospitalarios': 'num' }, meta: { Diabetes: { ref: 'No' }, 'Programa de educación en ERC': { ref: 'No' }, Sexo: { ref: 'Masculino' } },
    spec: { objective: 'causal', type: 'zinb', y: 'Ingresos hospitalarios', offset: 'Seguimiento (años)', exposure: 'Programa de educación en ERC', covs: ['Edad', 'Diabetes', 'TFGe (mL/min/1.73 m²)'] } },
  { file: 'erc_utilizacion.csv', title: 'ERC · gasto en salud (continuo positivo con ceros)', design: 'Misma base · 500 pacientes', use: 'Hurdle-Gamma (¿gasta algo? + cuánto) o Gamma en «Estancia de la primera hospitalización»',
    types: { 'Consultas de urgencias': 'num', 'Ingresos hospitalarios': 'num' }, meta: { Diabetes: { ref: 'No' }, 'Programa de educación en ERC': { ref: 'No' }, Sexo: { ref: 'Masculino' } },
    spec: { objective: 'causal', type: 'hgamma', y: 'Gasto en salud (USD/año)', exposure: 'Programa de educación en ERC', covs: ['Edad', 'Diabetes', 'TFGe (mL/min/1.73 m²)'] } },
  { file: 'erc_categoricas.csv', title: 'ERC · estadio de la enfermedad (ordinal)', design: 'Transversal · 600 pacientes', use: 'Regresión ordinal (odds proporcionales); también «Calidad de vida» (reordene las categorías)',
    meta: { Diabetes: { ref: 'No' }, 'Apoyo familiar': { ref: 'Adecuado' }, 'Albuminuria alta (≥ 300 mg/g)': { ref: 'No' }, Sexo: { ref: 'Masculino' } },
    spec: { objective: 'asociacion', type: 'ordinal', y: 'Estadio de ERC', exposure: 'Diabetes', covs: ['Edad', 'Sexo', 'Albuminuria alta (≥ 300 mg/g)'] } },
  { file: 'erc_categoricas.csv', title: 'ERC · modalidad de tratamiento elegida (nominal)', design: 'Transversal · 600 pacientes', use: 'Regresión multinomial: cada modalidad frente a la referencia',
    meta: { Diabetes: { ref: 'No' }, 'Apoyo familiar': { ref: 'Adecuado' }, 'Albuminuria alta (≥ 300 mg/g)': { ref: 'No' }, Sexo: { ref: 'Masculino' } },
    spec: { objective: 'asociacion', type: 'multinom', y: 'Modalidad elegida', yRef: 'Hemodiálisis', yFocus: 'Trasplante', exposure: 'Apoyo familiar', covs: ['Edad', 'Diabetes', 'Años de estudio'] } },
  { file: 'centros_dialisis.csv', title: 'Centros de diálisis · infección (multinivel)', design: '893 pacientes en 30 centros', use: 'Logística o Poisson con intercepto aleatorio por centro (CCI, MOR); Kt/V con el modelo mixto lineal',
    types: { 'Episodios de infección': 'num' }, meta: { 'Hospitalización por infección': { event: 'Sí' }, 'Catéter venoso central': { ref: 'No' }, Diabetes: { ref: 'No' }, 'Tipo de centro': { ref: 'Público' }, Sexo: { ref: 'Masculino' } },
    spec: { objective: 'causal', type: 'glmm', family: 'binomial', y: 'Hospitalización por infección', id: 'Centro', exposure: 'Catéter venoso central', covs: ['Edad', 'Diabetes', 'Albúmina (g/dL)', 'Tipo de centro'] } },
];
const OBJECTIVES = {
  causal: { t: 'Causal: efecto de una intervención o exposición', d: '¿Cuál es el efecto del catéter vs la fístula sobre la mortalidad? Se ajusta por confusores elegidos a priori.' },
  asociacion: { t: 'Explicativo: factores asociados', d: '¿Qué características se asocian con depresión en hemodiálisis? Describe asociaciones, sin afirmar causalidad.' },
};
const SOURCES = {
  cc: { t: 'Casos completos', d: 'Solo pacientes con todos los datos del modelo. Insesgado si la pérdida es MCAR; pierde potencia.' },
  mi: { t: 'Imputación múltiple (MICE)', d: 'Análisis principal recomendado si la pérdida es MAR. Requiere ejecutar MICE en el paso 5.' },
  mean: { t: 'Media / moda', d: 'Imputación simple. Reduce la variabilidad y puede sesgar; solo como sensibilidad.', es: 'media para cuantitativas y moda para categóricas', en: 'mean for continuous and mode for categorical variables' },
  median: { t: 'Mediana / moda', d: 'Imputación simple, menos sensible a valores extremos que la media.', es: 'mediana para cuantitativas y moda para categóricas', en: 'median for continuous and mode for categorical variables' },
  knn: { t: 'k vecinos más cercanos (k = 5)', d: 'Rellena con pacientes parecidos (distancia de Gower). Imputación simple.', es: 'k vecinos más cercanos (k = 5, distancia de Gower)', en: 'k-nearest neighbours (k = 5, Gower distance)' },
  locf: { t: 'Última observación (LOCF)', d: 'Solo longitudinal: arrastra el último valor del paciente. Supone que nada cambia tras el abandono.', es: 'última observación arrastrada (LOCF)', en: 'last observation carried forward (LOCF)' },
  missind: { t: 'Categoría «Perdido»', d: 'Las categóricas reciben un nivel «Perdido» (cuantitativas: mediana). Sesgado en general; solo exploratorio.', es: 'categoría «Perdido» para categóricas y mediana para cuantitativas', en: 'a "Missing" category for categorical and median for continuous variables' },
};

const state = { sheets: null, sheet: null, raw: [], meta: {}, ds: null, mi: null, little: null, type: 'logistic', objective: 'asociacion', inter: [], spec: null, draft: null, R: null, Rcc: null, sel: null, source: 'cc', lang: 'es', delta: false, fname: '', page: 0, showCovs: null };

// ---------------- navegación ----------------
$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) showTab(g.dataset.go); });
function showTab(t) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  if (t === 'base') renderDB();
  if (t === 'perdidos' && state.ds) renderMissGroups();
  if (t === 'modelos') renderSources();
  if (t === 'reporte') renderReport();
  if (t === 'modelizacion') renderSelCtx();
  if (t === 'descriptivo' && state.ds && !$('#t1-out').innerHTML) { const g = state.spec?.exposure; if (g && state.meta[g]?.type === 'cat') $('#t1-group').value = g; }
  window.scrollTo({ top: 0 });
}
$('#help').innerHTML = HELP_HTML;
function gate() {
  $$('.need-data').forEach(e => (e.hidden = !!state.ds)); $$('.has-data').forEach(e => (e.hidden = !state.ds));
  $$('.need-model').forEach(e => (e.hidden = !!state.R)); $$('.has-model').forEach(e => (e.hidden = !state.R));
}

// ---------------- carga ----------------
$('#examples').innerHTML = EXAMPLES.map((x, k) => `<button class="ghost" data-ex="${k}"><em>${esc(x.design)}</em><b>${esc(x.title)}</b><small>${esc(x.use)}</small></button>`).join('');
$$('[data-ex]').forEach(b => b.addEventListener('click', async () => {
  const x = EXAMPLES[+b.dataset.ex], r = await fetch('examples/' + x.file), txt = await r.text();
  await loadFile(new File([txt], x.file, { type: 'text/csv' }));
  for (const [v, t] of Object.entries(x.types || {})) if (state.meta[v]) state.meta[v].type = t;
  for (const [v, o] of Object.entries(x.meta || {})) if (state.meta[v]) Object.assign(state.meta[v], o);
  rebuild();
  state.spec = null; state.draft = { inter: [], ...x.spec }; state.type = x.spec.type; state.objective = x.spec.objective; state.inter = (x.spec.inter || []).map(p => [...p]);
  $$('[data-ex]').forEach(e => e.classList.toggle('active', e === b));
  renderVarTable(); renderMissing(); renderQuestion();
}));
$('#db-dl').addEventListener('click', () => {
  if (!state.ds) return; const cols = Object.keys(state.meta).filter(c => state.meta[c].type !== 'skip');
  const rows = Array.from({ length: state.ds.n }, (_, i) => Object.fromEntries(cols.map(c => [c, isMiss(state.ds.cols[c][i]) ? '' : state.ds.cols[c][i]])));
  download(`${state.fname || 'datos'}_limpia.csv`, toCSV(rows, cols), 'text/csv');
});
$('#file').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));
const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]));
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
  state.sheet = name; state.raw = (state.sheets[name] || []).map(r => ({ ...r }));
  if (!state.raw.length) { $('#load-msg').innerHTML = errBox('La hoja está vacía.'); return; }
  const old = state.meta; state.meta = inferMeta(state.raw, naCodes());
  if (keepTypes) for (const [k, m] of Object.entries(old)) if (state.meta[k] && (m.type !== 'num' || state.meta[k].allNum)) Object.assign(state.meta[k], { type: m.type, ref: state.meta[k].levels.includes(m.ref) ? m.ref : state.meta[k].ref, event: state.meta[k].levels.includes(m.event) ? m.event : state.meta[k].event });
  Object.assign(state, { mi: null, R: null, Rcc: null, little: null, inter: [], spec: null, draft: null, page: 0, showCovs: null });
  rebuild();
  $('#load-msg').innerHTML = `<p class="pill">✓ ${esc(state.fname)}: ${state.raw.length} filas × ${Object.keys(state.meta).length} columnas</p>`;
  renderVarTable(); renderMissing(); renderQuestion(); $('#model-out').innerHTML = ''; $('#mi-out').innerHTML = ''; $('#mi-status').textContent = ''; $('#mi-dl').hidden = true; $('#t1-out').innerHTML = ''; gate();
}
function rebuild() {
  const active = Object.fromEntries(Object.entries(state.meta).filter(([, m]) => m.type !== 'skip'));
  state.ds = typedData(state.raw, active, naCodes());
}
const usable = (...types) => Object.values(state.meta).filter(m => m.type !== 'skip' && (!types.length || types.includes(m.type))).map(m => m.name);
const natural = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });

// renombrar una variable (se reescriben las filas manteniendo el orden de columnas)
function renameVar(oldN, newN) {
  newN = newN.trim();
  if (!newN || newN === oldN) return false;
  if (state.meta[newN]) { alertBox(`Ya existe una variable llamada «${newN}».`); return false; }
  state.raw = state.raw.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === oldN ? newN : k, v])));
  state.meta = Object.fromEntries(Object.entries(state.meta).map(([k, m]) => (k === oldN ? [newN, { ...m, name: newN }] : [k, m])));
  const sw = v => (v === oldN ? newN : v), fix = s => s && Object.assign(s, { y: sw(s.y), time: sw(s.time), status: sw(s.status), id: sw(s.id), tvar: sw(s.tvar), offset: sw(s.offset), exposure: sw(s.exposure), covs: (s.covs || []).map(sw), inter: (s.inter || []).map(p => p.map(sw)) });
  fix(state.spec); fix(state.draft); state.inter = state.inter.map(p => p.map(sw)); state.mi = null; state.R = null;
  return true;
}
// renombrar o agrupar categorías (dos categorías con el mismo nombre nuevo se fusionan)
function recodeLevels(v, map) {
  const na = new Set(naCodes().map(s => String(s).toLowerCase().trim()));
  state.raw.forEach(r => { const x = String(r[v] ?? '').trim(); if (map[x] != null && map[x] !== x) r[v] = map[x]; });
  const m = state.meta[v], lv = [...new Set(state.raw.map(r => String(r[v] ?? '').trim()).filter(x => !na.has(x.toLowerCase())))].sort(natural);
  m.levels = lv; m.nDistinct = lv.length;
  if (!lv.includes(m.ref)) m.ref = lv.includes(map[m.ref]) ? map[m.ref] : lv[0];
  if (!lv.includes(m.event)) m.event = lv.includes(map[m.event]) ? map[m.event] : lv[lv.length - 1];
  state.mi = null; state.R = null;
}
function alertBox(msg) { $('#load-msg').innerHTML = errBox(msg); $('#load-msg').scrollIntoView({ block: 'center' }); }

function renderVarTable() {
  const T = $('#vartable');
  T.innerHTML = `<thead><tr><th>Nombre (como aparecerá en tablas)</th><th>Tipo</th><th>Referencia</th><th>Evento (desenlace Sí/No)</th><th class="num">Perdidos</th><th>Resumen y categorías</th></tr></thead><tbody>${Object.values(state.meta).map(m => {
    const col = state.ds.cols[m.name], miss = col ? missCount(col) : 0, isCat = m.type === 'cat';
    let summ = '';
    if (m.type === 'num' && col) { const v = Array.from(col).filter(isFinite); summ = `media ${f2(mean(v))} ± ${f2(sd(v))}; rango ${f2(Math.min(...v))}–${f2(Math.max(...v))}`; }
    else if (col && isCat) { const c = {}; col.forEach(x => x != null && (c[x] = (c[x] || 0) + 1)); summ = levelsOf(m).slice(0, 6).map(l => `${l} (${c[l] || 0})`).join(' · ') + (m.levels.length > 6 ? ` … (${m.levels.length} categorías)` : ''); }
    else if (m.type === 'id') summ = `${m.nDistinct} valores distintos`;
    const edit = isCat && m.levels.length <= 30 ? `<details><summary class="sub">Renombrar o agrupar categorías</summary><div class="catedit">${m.levels.map(l => `<label class="inline"><span class="sub">${esc(l)} →</span><input data-lv="${esc(l)}" value="${esc(l)}"></label>`).join('')}<button class="ghost" data-recode="1">Aplicar</button><span class="sub">Escriba el mismo nombre en dos categorías para unirlas.</span></div></details>` : '';
    return `<tr data-v="${esc(m.name)}"><td><input data-k="name" value="${esc(m.name)}" size="26"></td>
      <td><select data-k="type">${opt('num', 'Cuantitativa', m.type === 'num')}${opt('cat', 'Categórica', m.type === 'cat')}${opt('id', 'Identificador', m.type === 'id')}${opt('skip', 'Excluir', m.type === 'skip')}</select></td>
      <td>${isCat ? `<select data-k="ref">${m.levels.map(l => opt(l, l, l === m.ref)).join('')}</select>` : ''}</td>
      <td>${isCat ? `<select data-k="event">${m.levels.map(l => opt(l, l, l === m.event)).join('')}</select>` : ''}</td>
      <td class="num">${m.type === 'skip' ? '' : `${miss} (${pct(miss / state.raw.length)})`}</td><td class="sub" style="white-space:normal;min-width:240px">${esc(summ)}${edit}</td></tr>`;
  }).join('')}</tbody>`;
  T.querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    const v = s.closest('tr').dataset.v, k = s.dataset.k, m = state.meta[v];
    if (k === 'type' && s.value === 'num' && !m.allNum) { alertBox(`«${v}» contiene valores no numéricos; no puede tratarse como cuantitativa.`); s.value = m.type; return; }
    m[k] = s.value; rebuild(); state.mi = null; $('#mi-out').innerHTML = ''; $('#mi-status').textContent = '';
    if (k === 'type') { renderVarTable(); renderMissing(); }
    renderQuestion();
  }));
  T.querySelectorAll('input[data-k="name"]').forEach(inp => inp.addEventListener('change', () => { const v = inp.closest('tr').dataset.v; if (renameVar(v, inp.value)) { rebuild(); renderVarTable(); renderMissing(); renderQuestion(); } else inp.value = v; }));
  T.querySelectorAll('[data-recode]').forEach(b => b.addEventListener('click', () => { const tr = b.closest('tr'), v = tr.dataset.v, map = {}; tr.querySelectorAll('[data-lv]').forEach(i => { if (i.value.trim()) map[i.dataset.lv] = i.value.trim(); }); recodeLevels(v, map); rebuild(); renderVarTable(); renderMissing(); renderQuestion(); }));
  $('#t1-group').innerHTML = opt('', '— sin grupos —') + usable('cat').map(v => opt(v)).join('');
}

// ---------------- 2 · base de datos ----------------
$('#db-miss').addEventListener('change', () => { state.page = 0; renderDB(); });
$('#db-q').addEventListener('input', () => { state.page = 0; renderDB(); });
function renderDB() {
  if (!state.ds) return;
  const cols = usable(), ds = state.ds, q = $('#db-q').value.trim().toLowerCase(), onlyMiss = $('#db-miss').checked;
  const rows = []; for (let i = 0; i < ds.n; i++) { if (onlyMiss && !cols.some(c => isMiss(ds.cols[c][i]))) continue; if (q && !cols.some(c => String(ds.cols[c][i] ?? '').toLowerCase().includes(q))) continue; rows.push(i); }
  const per = 50, pages = Math.max(1, Math.ceil(rows.length / per)); state.page = Math.min(state.page, pages - 1);
  const show = rows.slice(state.page * per, (state.page + 1) * per);
  const fmt = (c, v) => (isMiss(v) ? '<td class="na">·</td>' : state.meta[c].type === 'num' ? `<td class="num">${esc(+v.toFixed(4))}</td>` : `<td>${esc(v)}${state.meta[c].type === 'cat' && v === state.meta[c].ref ? ' <span class="badge">ref</span>' : ''}</td>`);
  $('#db-table').innerHTML = `<table class="data"><thead><tr><th class="num">Fila</th>${cols.map(c => `<th>${esc(c)}<span class="badge${state.meta[c].type === 'cat' ? ' cat' : ''}">${{ num: 'cuant.', cat: 'categ.', id: 'id' }[state.meta[c].type]}</span></th>`).join('')}</tr></thead><tbody>${show.map(i => `<tr><td class="num sub">${i + 1}</td>${cols.map(c => fmt(c, ds.cols[c][i])).join('')}</tr>`).join('')}</tbody></table>`;
  $('#db-info').textContent = `${rows.length} de ${ds.n} filas`;
  $('#db-pager').innerHTML = `<button class="ghost" data-pg="-1"${state.page ? '' : ' disabled'}>← Anterior</button><span>Página ${state.page + 1} de ${pages}</span><button class="ghost" data-pg="1"${state.page < pages - 1 ? '' : ' disabled'}>Siguiente →</button>`;
  $$('[data-pg]').forEach(b => b.addEventListener('click', () => { state.page += +b.dataset.pg; renderDB(); }));
}

// ---------------- 3 · pregunta y modelo ----------------
function renderQuestion() {
  if (!state.ds) return;
  $('#objective').innerHTML = Object.entries(OBJECTIVES).map(([k, o]) => `<label class="choice${state.objective === k ? ' active' : ''}"><span><input type="radio" name="obj" value="${k}"${state.objective === k ? ' checked' : ''}>${esc(o.t)}</span><small>${esc(o.d)}</small></label>`).join('');
  $$('input[name="obj"]').forEach(r => r.addEventListener('change', () => { state.draft = currentDraft(); state.objective = r.value; renderQuestion(); }));
  $('#obj-msg').innerHTML = state.objective === 'causal'
    ? `<p><b>Pregunta causal.</b> Indique la <b>variable de intervención</b> (la causa cuyo efecto quiere estimar) y como covariables solo los <b>confusores</b>: causas comunes de la intervención y del desenlace. Dibuje antes un diagrama causal (DAG; p. ej., en dagitty.net).</p><p>No ajuste por <b>mediadores</b> (variables en el camino entre intervención y desenlace, p. ej., la albúmina si la intervención la modifica) ni por <b>colisionadores</b> (consecuencias comunes de ambas).</p><p class="warn"><b>Falacia de la Tabla 2</b> (Westreich y Greenland 2013): en un modelo causal, solo el coeficiente de la intervención estima un efecto. Los coeficientes de los confusores <b>no</b> deben interpretarse como sus efectos, porque el modelo no está construido para ellos (sus propios confusores y mediadores son otros). Por eso, en los resultados las covariables se ocultan por defecto.</p>`
    : '<p><b>Pregunta explicativa.</b> Se describen las asociaciones de cada variable con el desenlace, ajustadas por las demás. Use un lenguaje de asociación («se asoció con»), no causal. Si le interesa una variable en particular, márquela como exposición principal.</p>';
  renderSpecForm();
}
$$('#types button').forEach(b => b.addEventListener('click', () => { state.draft = currentDraft(); state.type = b.dataset.type; renderSpecForm(); }));
function sel(id, label, vars, cur, { none = false, hint = '' } = {}) {
  return `<label>${label}${hint ? ` <span class="sub">${hint}</span>` : ''}<select id="${id}">${none ? opt('', '— ninguna —', !cur) : ''}${vars.map(v => opt(v, v, v === cur)).join('')}</select></label>`;
}
function currentDraft() { if (!$('#sp-exp')) return state.draft; const g = id => $(id)?.value || null; return { ...(state.draft || {}), y: g('#sp-y') ?? state.draft?.y, time: g('#sp-time') ?? state.draft?.time, status: g('#sp-status') ?? state.draft?.status, id: g('#sp-id') ?? state.draft?.id, tvar: g('#sp-tvar') ?? state.draft?.tvar, exposure: g('#sp-exp'), covs: checked($('#sp-covs')), robust: g('#sp-robust'), measureLabel: g('#sp-measure'), offset: g('#sp-offset'), family: g('#sp-family'), corstr: g('#sp-corstr'), zeroMode: g('#sp-zmode') || 'same', zeroVars: $('#sp-zvars') ? checked($('#sp-zvars')) : null, yRef: g('#sp-yref'), yFocus: g('#sp-yfocus'), yOrder: state.type === 'ordinal' && sp0y() ? [...(state.yOrder?.[sp0y()] || [])] : null }; }
function renderSpecForm() {
  if (!state.ds) return;
  const t = state.type, sp = state.draft || state.spec || {}, causal = state.objective === 'causal';
  $$('#types button').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  const num = usable('num'), cat = usable('cat'), anyv = usable('num', 'cat'), ids = usable('id', 'cat', 'num');
  let h = '<div class="spec-grid">';
  const cat3 = cat.filter(v => state.meta[v].levels.length > 2), isCount = ['count', 'nb', 'zip', 'zinb'].includes(t);
  const yC = ['linear', 'lmm', 'gamma', 'hgamma'].includes(t) || isCount ? num : t === 'logistic' ? cat : t === 'poisson' ? [...cat, ...num] : t === 'gee' || t === 'glmm' ? [...num, ...cat] : ['ordinal', 'multinom'].includes(t) ? (cat3.length ? cat3 : cat) : [];
  if (t === 'cox') h += sel('sp-time', 'Tiempo de seguimiento', num, sp.time) + sel('sp-status', 'Indicador de evento (desenlace)', [...cat, ...num.filter(v => state.meta[v].nDistinct === 2)], sp.status) + '<label>Categoría que indica el evento<select id="sp-event"></select></label>';
  else h += sel('sp-y', 'Desenlace (variable dependiente)', yC, sp.y) + '<label id="sp-event-wrap">Categoría de evento<select id="sp-event"></select></label>';
  if (t === 'gee' || t === 'lmm' || t === 'glmm') h += sel('sp-id', t === 'glmm' ? 'Identificador del conglomerado (hospital, centro, paciente)' : 'Identificador del paciente', ids, sp.id ?? usable('id')[0]) + (t === 'glmm' ? '' : sel('sp-tvar', 'Tiempo / visita', num, sp.tvar));
  h += sel('sp-exp', causal ? '<b>Variable de intervención</b> (causa de interés)' : 'Exposición principal', anyv, sp.exposure, { none: !causal });

  if (isCount || t === 'gamma') h += sel('sp-offset', isCount ? 'Persona-tiempo (offset; se usa su logaritmo)' : 'Offset (opcional; se usa su logaritmo)', num, sp.offset, { none: true });
  if (t === 'glmm') h += `<label>Tipo de desenlace<select id="sp-family">${opt('binomial', 'Binario · logit (OR condicional)', sp.family !== 'poisson')}${opt('poisson', 'Conteo · log (razón de tasas condicional)', sp.family === 'poisson')}</select></label>` + sel('sp-offset', 'Persona-tiempo (solo conteos; offset)', num, sp.offset, { none: true });
  if (['zip', 'zinb', 'hgamma'].includes(t)) h += `<label>${t === 'hgamma' ? 'Covariables de la parte «¿es positivo?»' : 'Covariables de la parte de ceros estructurales'}<select id="sp-zmode">${opt('same', 'Las mismas que el resto del modelo', (sp.zeroMode || 'same') === 'same')}${opt('const', 'Solo el intercepto (como statsmodels por defecto)', sp.zeroMode === 'const')}${opt('custom', 'Elegir cuáles…', sp.zeroMode === 'custom')}</select></label><div class="wide" id="sp-zvars-wrap" hidden><b class="small">Variables de la parte de ceros</b><div id="sp-zvars" class="checks"></div></div>`;
  if (t === 'ordinal') h += `<div class="wide"><b class="small">Orden de las categorías del desenlace (de menor a mayor)</b><div id="sp-yorder" class="row gap wrap mt"></div><span class="sub">El OR indica la ventaja de estar en una categoría más alta. Reordene con las flechas si el orden alfabético no es el clínico.</span></div>`;
  if (t === 'multinom') h += '<label>Categoría de referencia del desenlace<select id="sp-yref"></select></label><label>Categoría que se muestra en el forest<select id="sp-yfocus"></select></label>';
  if (t === 'linear') h += `<label>Errores estándar<select id="sp-robust">${opt('none', 'Clásicos (MCO)', sp.robust === 'none')}${opt('HC3', 'Robustos HC3 (si hay heterocedasticidad)', sp.robust === 'HC3')}${opt('HC1', 'Robustos HC1 (Stata)', sp.robust === 'HC1')}</select></label>`;
  if (t === 'poisson') h += `<label>Medida de asociación<select id="sp-measure">${opt('RP', 'Razón de prevalencias (transversal)', sp.measureLabel === 'RP')}${opt('RR', 'Riesgo relativo (cohorte)', sp.measureLabel === 'RR')}${opt('RTI', 'Razón de tasas (conteos con persona-tiempo)', sp.measureLabel === 'RTI')}</select></label>` + sel('sp-offset', 'Persona-tiempo (offset; se usa su logaritmo)', num, sp.offset, { none: true });
  if (t === 'gee') h += `<label>Familia / enlace<select id="sp-family">${opt('gaussian', 'Gaussiana · identidad (β)', sp.family === 'gaussian')}${opt('binomial', 'Binomial · logit (OR)', sp.family === 'binomial')}${opt('poisson', 'Poisson · log (RR)', sp.family === 'poisson')}</select></label><label>Correlación de trabajo<select id="sp-corstr">${opt('exchangeable', 'Intercambiable', sp.corstr === 'exchangeable')}${opt('ar1', 'Autorregresiva AR(1)', sp.corstr === 'ar1')}${opt('independence', 'Independencia', sp.corstr === 'independence')}</select></label>`;
  h += `<div class="wide"><b class="small">${causal ? 'Confusores (variables de ajuste elegidas por conocimiento previo / DAG)' : 'Covariables de ajuste'}</b><div id="sp-covs" class="checks"></div></div>`;
  h += `<div class="wide"><b class="small">Interacciones</b> <span class="sub">(¿el efecto cambia según otra variable? p. ej., Tratamiento × Mes en datos longitudinales)</span><div class="row gap wrap mt"><select id="sp-ia">${anyv.map(v => opt(v)).join('')}</select>×<select id="sp-ib">${anyv.map(v => opt(v)).join('')}</select><button id="sp-iadd" class="ghost" type="button">Añadir</button></div><div class="inter-list" id="sp-ilist"></div></div></div>`;
  $('#spec-form').innerHTML = h;
  const refreshEvent = () => {
    const v = t === 'cox' ? $('#sp-status').value : $('#sp-y').value, m = state.meta[v], wrap = $('#sp-event-wrap');
    const show = m && m.type === 'cat'; if (wrap) wrap.hidden = !show || t === 'ordinal' || t === 'multinom';
    $('#sp-event').innerHTML = show ? m.levels.map(l => opt(l, l, l === m.event)).join('') : '';
    if (t === 'glmm' && m) $('#sp-family').value = m.type === 'cat' ? 'binomial' : 'poisson';
    if (t === 'ordinal' && m) drawOrder(v);
    if (t === 'multinom' && m) drawRef(v);
    if (t === 'gee' && m) { const f = $('#sp-family'); if (m.type === 'cat' && f.value === 'gaussian') f.value = 'binomial'; if (m.type === 'num' && f.value === 'binomial') f.value = 'gaussian'; }
    hint();
  };
  const orderOf = v => { const m = state.meta[v], cur = state.yOrder?.[v]; return cur && cur.length === m.levels.length && m.levels.every(l => cur.includes(l)) ? cur : [...m.levels]; };
  const drawOrder = v => {
    const o = orderOf(v); state.yOrder = { ...(state.yOrder || {}), [v]: o };
    $('#sp-yorder').innerHTML = o.map((l, k) => `<span class="chip">${k + 1}. ${esc(l)} <button type="button" data-k="${k}" data-d="-1" title="Subir">↑</button><button type="button" data-k="${k}" data-d="1" title="Bajar">↓</button></span>`).join('');
    $$('#sp-yorder button').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.k, j = k + +b.dataset.d; if (j < 0 || j >= o.length) return; [o[k], o[j]] = [o[j], o[k]]; drawOrder(v); hint(); }));
  };
  const drawRef = v => {
    const m = state.meta[v], ref = $('#sp-yref').value || sp.yRef || m.ref, fo = $('#sp-yfocus').value || sp.yFocus;
    $('#sp-yref').innerHTML = m.levels.map(l => opt(l, l, l === ref)).join('');
    const others = m.levels.filter(l => l !== ref); $('#sp-yfocus').innerHTML = others.map(l => opt(l, l, l === (others.includes(fo) ? fo : others[0]))).join('');
  };
  $('#sp-yref')?.addEventListener('change', () => { drawRef($('#sp-y').value); hint(); });
  const refreshZero = () => {
    const wrap = $('#sp-zvars-wrap'); if (!wrap) return; wrap.hidden = $('#sp-zmode').value !== 'custom'; if (wrap.hidden) return;
    const cand = [$('#sp-exp').value, ...checked($('#sp-covs'))].filter(Boolean), cur = $('#sp-zvars').dataset.init ? checked($('#sp-zvars')) : sp.zeroVars || cand;
    checks($('#sp-zvars'), cand, cur.filter(v => cand.includes(v)), 'zvars'); $('#sp-zvars').dataset.init = '1';
  };
  $('#sp-zmode')?.addEventListener('change', refreshZero); $('#sp-exp').addEventListener('change', refreshZero); $('#sp-covs').addEventListener('change', refreshZero);
  const refreshCovs = () => {
    const excl = new Set([$('#sp-y')?.value, $('#sp-time')?.value, $('#sp-status')?.value, $('#sp-id')?.value, $('#sp-exp').value, $('#sp-offset')?.value].filter(Boolean));
    const cur = $('#sp-covs').dataset.init ? checked($('#sp-covs')) : sp.covs || [];
    checks($('#sp-covs'), anyv.filter(v => !excl.has(v)), cur.filter(v => !excl.has(v)), 'covs'); $('#sp-covs').dataset.init = '1';
  };
  ['#sp-y', '#sp-status'].forEach(s => $(s)?.addEventListener('change', () => { refreshEvent(); refreshCovs(); }));
  ['#sp-exp', '#sp-time', '#sp-id', '#sp-offset'].forEach(s => $(s)?.addEventListener('change', () => { refreshCovs(); hint(); }));
  $('#sp-event').addEventListener('change', e => { const v = t === 'cox' ? $('#sp-status').value : $('#sp-y').value; state.meta[v].event = e.target.value; hint(); });
  $('#sp-measure')?.addEventListener('change', hint);
  refreshEvent(); refreshCovs(); refreshZero();
  state.inter = (state.inter || []).filter(p => p.every(v => state.meta[v]));
  const drawInter = () => { $('#sp-ilist').innerHTML = state.inter.map((p, k) => `<span>${esc(p.join(' × '))}<button data-k="${k}" title="Quitar">✕</button></span>`).join(''); $$('#sp-ilist button').forEach(b => b.addEventListener('click', () => { state.inter.splice(+b.dataset.k, 1); drawInter(); })); };
  drawInter();
  $('#sp-iadd').addEventListener('click', () => { const a = $('#sp-ia').value, b = $('#sp-ib').value; if (a && b && a !== b && !state.inter.some(p => p.includes(a) && p.includes(b))) state.inter.push([a, b]); drawInter(); });
}
// recomendación según el desenlace elegido
function hint() {
  const t = state.type, el = $('#spec-hint'), v = t === 'cox' ? $('#sp-status')?.value : $('#sp-y')?.value, m = state.meta[v]; if (!m) { el.innerHTML = ''; return; }
  const col = state.ds.cols[v]; let msg = '';
  if (m.type === 'cat') {
    const obs = col.filter(x => x != null), k = obs.filter(x => x === m.event).length, p = k / obs.length;
    msg = `Desenlace «${esc(v)}» = «${esc(m.event)}»: ${pct(p)} de los pacientes (${k}/${obs.length}). `;
    if (m.levels.length > 2) msg += `Tiene ${m.levels.length} categorías: «${esc(m.event)}» se compara contra todas las demás. `;
    if (t === 'logistic' && p > 0.1) msg += '<b>Desenlace frecuente (> 10 %):</b> el OR exagera la asociación respecto a la razón de prevalencias o al riesgo relativo; considere <b>Poisson con varianza robusta</b>. ';
    if (t === 'logistic' && p <= 0.1) msg += 'Desenlace poco frecuente: el OR se aproxima al riesgo relativo. ';
    if (t === 'poisson') msg += $('#sp-measure')?.value === 'RTI' ? 'Para una razón de tasas, el desenlace debe ser un conteo e indicar la persona-tiempo como offset. ' : 'Poisson robusta estima directamente la RP (transversal) o el RR (cohorte). ';
    if (t === 'linear' || t === 'lmm') msg += 'Este desenlace es categórico: use logística, Poisson robusta o GEE binomial. ';
    if (t === 'cox') msg += 'Cada fila debe tener el tiempo hasta el evento o hasta la última observación (censura). ';
  } else {
    const x = Array.from(col).filter(isFinite), m_ = mean(x), s = sd(x), sk = x.reduce((a, b) => a + ((b - m_) / s) ** 3, 0) / x.length, ints = x.every(Number.isInteger) && Math.min(...x) >= 0;
    msg = `Desenlace «${esc(v)}»: media ${f2(m_)} ± ${f2(s)}; mediana ${f2(quantile(x, 0.5))}. `;
    if (t === 'logistic') msg += 'La regresión logística requiere un desenlace Sí/No. ';
    if ((t === 'linear' || t === 'lmm') && Math.abs(sk) > 1) msg += 'Distribución asimétrica: revise la normalidad de residuos; considere transformar (log) o errores estándar robustos. ';
    if (t === 'poisson' && ints) msg += 'Conteo: use la razón de tasas (RTI) e indique la persona-tiempo como offset si el seguimiento varía entre pacientes. ';
  }
  const hs = {
    count: 'Poisson supone media = varianza; si hay sobredispersión o más ceros de los esperados, el análisis de supuestos se lo indicará (use entonces binomial negativa o ZIP/ZINB). ',
    nb: 'La binomial negativa añade un parámetro α para la sobredispersión (varianza = μ + αμ²). Si α ≈ 0, Poisson es suficiente. ',
    zip: 'ZIP mezcla un proceso que genera ceros estructurales (parte logística) con un conteo Poisson. Úselo si hay más ceros de los que Poisson/binomial negativa explican (compruébelo con la prueba de Vuong en los supuestos). ',
    zinb: 'ZINB añade sobredispersión al ZIP. Necesita muestras mayores (más parámetros); elija pocas covariables en la parte de ceros. ',
    gamma: 'Gamma con enlace log modela la media de un desenlace positivo y asimétrico: el efecto es una razón de medias (multiplicativo). No admite ceros. ',
    hgamma: 'Hurdle-Gamma: una logística decide si el valor es &gt; 0 y una Gamma modela el tamaño entre los positivos. Los efectos de ambas partes se reportan por separado. ',
    ordinal: 'Un único OR resume el efecto sobre cualquier punto de corte de la escala ordenada (odds proporcionales). Compruebe el orden de las categorías abajo. ',
    multinom: 'Un conjunto de coeficientes por cada categoría frente a la referencia. Úsela cuando las categorías no tienen orden o no se cumplen las odds proporcionales. ',
    glmm: 'Intercepto aleatorio por conglomerado (hospital, centro, paciente): estima efectos condicionales y la variación entre conglomerados (CCI, MOR). Se ajusta por máxima verosimilitud con cuadratura adaptativa. ',
  }[t];
  if (hs) msg += hs;
  if (state.objective === 'causal' && !$('#sp-exp')?.value) msg += '<b>Elija la variable de intervención.</b>';
  el.innerHTML = `<p>${msg}</p>`;
}
const checked = el => [...el.querySelectorAll('input:checked')].map(i => i.value);
function checks(el, vars, chk, name) {
  el.innerHTML = `<div class="tools"><a data-all="1">todas</a><a data-all="0">ninguna</a></div>` + vars.map(v => `<label><input type="checkbox" name="${name}" value="${esc(v)}"${chk.includes(v) ? ' checked' : ''}> ${esc(v)}</label>`).join('');
  el.querySelectorAll('[data-all]').forEach(a => a.addEventListener('click', () => { el.querySelectorAll('input').forEach(i => (i.checked = a.dataset.all === '1')); el.dispatchEvent(new Event('change')); }));
}
const sp0y = () => $('#sp-y')?.value;
function readSpec() {
  const t = state.type, g = id => $(id)?.value || null;
  const sp = { type: t, objective: state.objective, y: g('#sp-y'), time: g('#sp-time'), status: g('#sp-status'), id: g('#sp-id'), tvar: g('#sp-tvar'), exposure: g('#sp-exp'), covs: checked($('#sp-covs')), inter: state.inter.map(p => [...p]), robust: g('#sp-robust') || 'none', measureLabel: g('#sp-measure'), offset: g('#sp-offset'), family: g('#sp-family'), corstr: g('#sp-corstr'),
    zeroMode: g('#sp-zmode') || 'same', zeroVars: $('#sp-zvars') ? checked($('#sp-zvars')) : null, yRef: g('#sp-yref'), yFocus: g('#sp-yfocus'), yOrder: t === 'ordinal' && g('#sp-y') ? [...(state.yOrder?.[g('#sp-y')] || [])] : null };
  if (t === 'cox') sp.y = null; else { sp.time = sp.status = null; }
  const ev = g('#sp-event'), ov = t === 'cox' ? sp.status : sp.y; if (ev && state.meta[ov]?.type === 'cat') state.meta[ov].event = ev;
  sp.inter.flat().forEach(v => { if (v !== sp.exposure && !sp.covs.includes(v)) sp.covs.push(v); });
  sp.numVars = [sp.exposure, ...sp.covs].filter(v => v && state.meta[v].type === 'num');
  if (state.objective === 'causal' && !sp.exposure) throw new Error('En una pregunta causal debe indicar la variable de intervención.');
  if (!sp.exposure && !sp.covs.length) throw new Error('Elija una exposición o al menos una covariable.');
  if (t !== 'cox' && !sp.y) throw new Error('Elija el desenlace.');
  if (t === 'cox' && (!sp.time || !sp.status)) throw new Error('Elija el tiempo y el indicador de evento.');
  if ((t === 'gee' || t === 'lmm' || t === 'glmm') && !sp.id) throw new Error('Elija el identificador del paciente.');
  if (['linear', 'lmm', 'gamma', 'hgamma', 'count', 'nb', 'zip', 'zinb'].includes(t) && state.meta[sp.y].type !== 'num') throw new Error('El modelo lineal requiere un desenlace cuantitativo.');
  if (['ordinal', 'multinom'].includes(t)) {
    const m = state.meta[sp.y]; if (m.type !== 'cat' || m.levels.length < 3) throw new Error('Este modelo requiere un desenlace categórico con al menos 3 categorías.');
    if (t === 'multinom') m.event = sp.yFocus; else m.event = sp.yOrder[sp.yOrder.length - 1];
  }
  if (['count', 'nb', 'zip', 'zinb'].includes(t) && Array.from(state.ds.cols[sp.y]).some(v => isFinite(v) && (v < 0 || !Number.isInteger(v)))) throw new Error('Los modelos de conteo requieren un desenlace entero ≥ 0.');
  if (t === 'gamma' && Array.from(state.ds.cols[sp.y]).some(v => isFinite(v) && v <= 0)) throw new Error('Gamma requiere un desenlace > 0. Si hay ceros, use hurdle-Gamma.');
  if (t === 'hgamma') { const y = Array.from(state.ds.cols[sp.y]).filter(isFinite); if (y.some(v => v < 0)) throw new Error('Hurdle-Gamma requiere un desenlace ≥ 0.'); if (!y.some(v => v === 0)) throw new Error('El desenlace no tiene ceros: use el modelo Gamma.'); }
  if (t === 'glmm' && !sp.id) throw new Error('Elija el identificador del conglomerado.');
  if (t === 'glmm' && sp.family === 'poisson' && state.meta[sp.y].type === 'num' && Array.from(state.ds.cols[sp.y]).some(v => isFinite(v) && (v < 0 || !Number.isInteger(v)))) throw new Error('El desenlace de conteo debe ser entero ≥ 0.');
  if (t === 'poisson' && state.meta[sp.y].type === 'num' && Array.from(state.ds.cols[sp.y]).some(v => isFinite(v) && (v < 0 || !Number.isInteger(v)))) throw new Error('Poisson requiere un desenlace binario o un conteo entero ≥ 0.');
  return sp;
}
$('#q-next').addEventListener('click', () => {
  try { state.spec = readSpec(); state.draft = { ...state.spec }; showTab('descriptivo'); } catch (e) { $('#spec-hint').innerHTML = errBox(e); }
});
const specNow = () => readSpec();

// ---------------- 4 · Tabla 1 ----------------
let lastT1 = null;
$('#t1-run').addEventListener('click', () => {
  const g = $('#t1-group').value || null, vars = usable('num', 'cat');
  try {
    lastT1 = table1(state.ds, state.meta, vars, g);
    if (!$('#t1-p').checked && g) { lastT1.head = lastT1.head.slice(0, -2); lastT1.rows.forEach(r => (r.cells = r.cells.slice(0, -2))); }
    $('#t1-out').innerHTML = `<div class="tablewrap tall">${table1HTML(lastT1)}</div>`;
  } catch (e) { $('#t1-out').innerHTML = errBox(e); }
});
$('#t1-doc').addEventListener('click', () => lastT1 && download('Tabla1.doc', wordDoc('Tabla 1. Características de los participantes', matrixHTML({ head: lastT1.head, body: lastT1.rows.map(r => ({ b: r.bold, c: r.cells })) }), lastT1.note), 'application/msword'));
$('#t1-csv').addEventListener('click', () => lastT1 && download('Tabla1.csv', matrixCSV({ head: lastT1.head, body: lastT1.rows.map(r => ({ c: r.cells })) }), 'text/csv'));

// ---------------- 5 · datos perdidos ----------------
function renderMissing() {
  const ds = state.ds, vars = usable('num', 'cat');
  const S = missingSummary(ds, vars), withMiss = S.filter(s => s.miss > 0), cc = completeRows(ds, vars).length, cells = S.reduce((a, s) => a + s.miss, 0);
  $('#miss-kpis').innerHTML = [[ds.n, 'filas'], [`${cc} (${pct(cc / ds.n)})`, 'casos completos'], [`${withMiss.length} de ${vars.length}`, 'variables con perdidos'], [pct(cells / (ds.n * vars.length)), 'celdas perdidas']].map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
  $('#miss-bar').innerHTML = withMiss.length ? figWrap(missBarPlot([...withMiss].sort((a, b) => b.pct - a.pct)), 'perdidos_por_variable') : '<p class="ok">✓ No hay datos perdidos en las variables analizables.</p>';
  const pv = withMiss.map(s => s.v);
  $('#miss-pat').innerHTML = pv.length ? figWrap(patternPlot(patterns(ds, pv), pv), 'patrones_perdidos') + '<p class="sub">Cada fila es una combinación de variables observadas (azul) y perdidas (burdeos); a la izquierda, cuántos pacientes la tienen.</p>' : '';
  const mc = vars.filter(v => state.meta[v].type === 'num' || state.meta[v].levels.length === 2);
  checks($('#mcar-vars'), mc, mc.slice(0, 25), 'mcar'); $('#mcar-out').innerHTML = '';
  $('#mar-target').innerHTML = pv.map(v => opt(v)).join(''); renderMAR();
  checks($('#mi-vars'), vars, vars, 'mi'); renderMIMethods();
  updateMech(); renderMissGroups(); bindFigs(document);
}
$('#mi-vars').addEventListener('change', () => renderMIMethods());
// % de perdidos por grupos de la exposición y del desenlace
function renderMissGroups() {
  const el = $('#miss-groups'), sp = state.spec || state.draft || {}, ds = state.ds;
  const yv = (sp.type || state.type) === 'cox' ? sp.status : sp.y, E = sp.exposure, vars = usable('num', 'cat').filter(v => missCount(ds.cols[v]) > 0);
  if (!vars.length) { el.innerHTML = '<p class="ok">✓ No hay datos perdidos.</p>'; return; }
  const out = [];
  for (const [g, role] of [[E, 'exposición'], [yv, 'desenlace']]) {
    if (!g || !state.meta[g]) { out.push(`<p class="sub">Defina la ${role} en el paso 3 para ver este gráfico.</p>`); continue; }
    const m = state.meta[g], col = ds.cols[g];
    let grp, levels;
    if (m.type === 'cat') { levels = levelsOf(m); grp = i => col[i]; }
    else { const md = quantile(Array.from(col).filter(isFinite), 0.5); levels = [`≤ ${f2(md)}`, `> ${f2(md)}`]; grp = i => (isFinite(col[i]) ? (col[i] <= md ? levels[0] : levels[1]) : null); }
    const vs = vars.filter(v => v !== g), pctM = {}, pv = {};
    for (const v of vs) {
      pctM[v] = {}; const tab = levels.map(l => { let a = 0, b = 0; for (let i = 0; i < ds.n; i++) if (grp(i) === l) (isMiss(ds.cols[v][i]) ? a++ : b++); pctM[v][l] = a / ((a + b) || 1); return [a, b]; });
      try { pv[v] = chisqTest(tab.filter(r => r[0] + r[1] > 0)).p; } catch { /* sin prueba */ }
    }
    if (!vs.length) continue;
    const gm = missCount(col);
    out.push(`<div>${figWrap(missByGroupPlot(vs, levels, pctM, { title: `Perdidos según la ${role}: ${g}`, groupVar: g, pvals: pv }), `perdidos_por_${role}`)}${gm ? `<p class="sub">La propia ${role} tiene ${gm} datos perdidos (${pct(gm / ds.n)}), que no aparecen en ningún grupo.</p>` : ''}</div>`);
  }
  el.innerHTML = out.join(''); bindFigs(el);
}
$('#mcar-run').addEventListener('click', () => {
  const vars = checked($('#mcar-vars'));
  if (vars.length < 2) { $('#mcar-out').innerHTML = errBox('Seleccione al menos 2 variables.'); return; }
  try {
    const r = littleMCAR(state.ds, state.meta, vars); state.little = r;
    $('#mcar-out').innerHTML = `<div class="kpis"><div class="kpi"><b>${f2(r.stat)}</b><span>χ² de Little</span></div><div class="kpi"><b>${r.df}</b><span>gl</span></div><div class="kpi"><b>${fp(r.p)}</b><span>valor p</span></div></div>
      <p class="${r.p < 0.05 ? 'bad' : 'ok'}">${r.p < 0.05 ? '✗ Se rechaza MCAR: la pérdida se relaciona con los valores observados (compatible con MAR o MNAR).' : '✓ No se rechaza MCAR. Ojo: la prueba tiene poca potencia; no demuestra que los datos sean MCAR.'}</p>`;
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
  const sig = cmp.filter(c => c.p < 0.05), share = (a, k) => pct(a[k] / (a.reduce((x, y) => x + y, 0) || 1));
  out.innerHTML = `<div class="tablewrap"><table class="data"><thead><tr><th>Variable</th><th>Sin el dato de ${esc(t)}</th><th>Con el dato</th><th class="num">p</th></tr></thead><tbody>${cmp.map(c => `<tr><td>${esc(c.w)}</td><td>${c.kind === 'num' ? f2(c.sMiss) : c.kind === 'cat' ? c.levels.map((l, k) => `${esc(l)}: ${share(c.sMiss, k)}`).join('; ') : ''}</td><td>${c.kind === 'num' ? f2(c.sObs) : c.kind === 'cat' ? c.levels.map((l, k) => `${esc(l)}: ${share(c.sObs, k)}`).join('; ') : ''}</td><td class="num${c.p < 0.05 ? ' b' : ''}">${fp(c.p)}</td></tr>`).join('')}</tbody></table></div>
  ${mm && !mm.error ? `<p class="small">Modelo de la probabilidad de que falte <b>${esc(t)}</b>: p = ${fp(mm.p)}; AUC = ${f2(mm.auc, 3)} (0.5 = la pérdida no es predecible). ${mm.fit.p.map((p, j) => (j && p < 0.05 ? `${esc(mm.D.cols[j].label)} (OR ${f2(Math.exp(mm.fit.beta[j]))})` : null)).filter(Boolean).join('; ')}</p>` : ''}
  <p class="small">${sig.length ? `La pérdida de <b>${esc(t)}</b> se asocia con: ${sig.map(c => esc(c.w)).join(', ')}. Incluya estas variables en la imputación (supuesto MAR).` : `No hay variables observadas asociadas a la pérdida de ${esc(t)}.`}</p>`;
  updateMech();
}
function updateMech() {
  const L = state.little, sig = marRes?.cmp?.some(c => c.p < 0.05) || marRes?.mm?.p < 0.05, el = $('#mech-msg');
  if (!usable('num', 'cat').some(v => missCount(state.ds.cols[v]) > 0)) { el.innerHTML = '<p>✓ No hay datos perdidos: no se requiere imputación.</p>'; return; }
  el.innerHTML = `<p><b>Conclusión.</b> ${L ? (L.p >= 0.05 && !sig ? 'Los datos son <b>compatibles con MCAR</b>: el análisis de casos completos no estaría sesgado, aunque pierde precisión; la imputación múltiple recupera potencia.' : 'Hay evidencia <b>contra MCAR</b>' + (sig ? ': la pérdida depende de variables observadas (compatible con <b>MAR</b>). Use imputación múltiple como análisis principal, con esas variables en el modelo de imputación.' : '.')) : 'Calcule la prueba de Little y revise las variables con perdidos.'}</p><p><b>MNAR no se puede comprobar</b> con los datos. Tras imputar, el paso 6 ofrece un <b>análisis de sensibilidad δ</b> para ver si la conclusión cambiaría si los datos perdidos fueran sistemáticamente distintos.</p>`;
}
function renderMIMethods() {
  const vars = checked($('#mi-vars')).filter(v => missCount(state.ds.cols[v]) > 0), el = $('#mi-methods');
  el.innerHTML = vars.length ? vars.map(v => { const m = state.meta[v]; return `<label>${esc(v)} <span class="sub">(${missCount(state.ds.cols[v])} perdidos)</span><select data-mv="${esc(v)}">${methodsFor(m).map(k => opt(k, METHODS[k], k === defaultMethod(m))).join('')}</select></label>`; }).join('') : '<p class="sub">Ninguna variable seleccionada tiene datos perdidos.</p>';
}
$('#mi-run').addEventListener('click', async () => {
  const vars = checked($('#mi-vars')), prog = $('#mi-prog'), st = $('#mi-status');
  if (vars.length < 2) { $('#mi-out').innerHTML = errBox('Seleccione al menos 2 variables.'); return; }
  if (!vars.some(v => missCount(state.ds.cols[v]) > 0)) { $('#mi-out').innerHTML = errBox('Ninguna de las variables seleccionadas tiene datos perdidos.'); return; }
  const methods = Object.fromEntries($$('[data-mv]').map(s => [s.dataset.mv, s.value]));
  const m = Math.max(2, +$('#mi-m').value || 20), maxit = Math.max(1, +$('#mi-it').value || 10), seed = +$('#mi-seed').value || 2024, donors = +$('#mi-donors').value || 5;
  prog.hidden = false; prog.value = 0; st.textContent = 'Imputando…'; $('#mi-run').disabled = true;
  try {
    const t0 = performance.now();
    state.mi = await mice(state.ds, state.meta, { vars, m, maxit, seed, donors, methods, onProgress: v => (prog.value = v) });
    st.textContent = `✓ ${m} bases imputadas en ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
    state.source = 'mi'; $('#mi-dl').hidden = false; renderMI();
  } catch (e) { $('#mi-out').innerHTML = errBox(e); st.textContent = ''; }
  prog.hidden = true; $('#mi-run').disabled = false;
});
function renderMI() {
  const M = state.mi;
  const tbl = `<table class="data"><thead><tr><th>Variable</th><th class="num">Perdidos</th><th>Método</th></tr></thead><tbody>${M.target.map(v => `<tr><td>${esc(v)}</td><td class="num">${M.missIdx[v].length}</td><td>${METHODS[M.method[v]]}</td></tr>`).join('')}</tbody></table>`;
  const tr = M.target.map(v => figWrap(tracePlot(M.trace, v, state.meta[v].type === 'num'), `convergencia_${v}`)).join('');
  const strip = M.target.map(v => {
    const obs = Array.from(state.ds.cols[v]).filter(x => !isMiss(x));
    if (state.meta[v].type === 'num') return figWrap(stripPlot(obs, M.imps.slice(0, 20).map(d => M.missIdx[v].map(i => d.cols[v][i])), v), `imputados_${v}`);
    const ref = state.meta[v].ref, prop = a => a.filter(x => x !== ref).length / a.length;
    return figWrap(catImpPlot(prop(obs), M.imps.slice(0, 20).map(d => prop(M.missIdx[v].map(i => d.cols[v][i]))), v), `imputados_${v}`);
  }).join('');
  $('#mi-out').innerHTML = `<div class="tablewrap">${tbl}</div><h3>¿Convergió la imputación?</h3>${howto('Cada línea es una cadena de imputación: el valor medio imputado en cada iteración.', 'Comprobar que el algoritmo se estabilizó.', 'Las líneas deben mezclarse sin tendencia hacia arriba o abajo. Si hay tendencia, aumente las iteraciones.')}<div class="plots">${tr}</div><h3>¿Son plausibles los valores imputados?</h3>${howto('Valores observados (azul, columna 0) y los imputados (burdeos) en cada base.', 'Detectar imputaciones imposibles.', 'Bajo MAR los imputados pueden diferir de los observados, pero deben estar en un rango clínicamente posible.')}<div class="plots">${strip}</div>`;
  bindFigs($('#mi-out'));
}
$('#mi-dl').addEventListener('click', () => {
  const M = state.mi, cols = Object.keys(state.meta).filter(c => state.ds.cols[c]), rows = [];
  M.imps.forEach((d, k) => { for (let i = 0; i < d.n; i++) { const r = { '.imp': k + 1, '.id': i + 1 }; cols.forEach(c => { const x = d.cols[c][i]; r[c] = isMiss(x) ? '' : x; }); rows.push(r); } });
  download(`${state.fname || 'datos'}_imputados_m${M.m}.csv`, toCSV(rows, ['.imp', '.id', ...cols]), 'text/csv');
});

// ---------------- 6 · fuente de datos y ejecución ----------------
function renderSources() {
  if (!state.ds) return;
  const longi = state.type === 'gee' || state.type === 'lmm';
  if ((state.source === 'mi' && !state.mi) || (state.source === 'locf' && !longi)) state.source = 'cc';
  $('#sources').innerHTML = Object.entries(SOURCES).filter(([k]) => k !== 'locf' || longi).map(([k, o]) => {
    const dis = k === 'mi' && !state.mi;
    return `<label class="choice${state.source === k ? ' active' : ''}"><span><input type="radio" name="src" value="${k}"${state.source === k ? ' checked' : ''}${dis ? ' disabled' : ''}>${esc(o.t)}${k === 'mi' && state.mi ? ` (m = ${state.mi.m})` : ''}</span><small>${esc(dis ? 'Ejecute primero MICE en el paso 5.' : o.d)}</small></label>`;
  }).join('');
  $$('input[name="src"]').forEach(r => r.addEventListener('change', () => { state.source = r.value; renderSources(); }));
  $('#cmp-cc').disabled = state.source === 'cc';
}
function dataSets(spec, source) {
  if (source === 'mi') {
    const lack = modelVars(spec).filter(v => !state.mi.vars.includes(v) && missCount(state.ds.cols[v]) > 0);
    if (lack.length) throw new Error(`Variables del modelo con perdidos que no se incluyeron en la imputación: ${lack.join(', ')}. Inclúyalas en MICE (paso 5) o use casos completos.`);
    return { sets: state.mi.imps, meta: state.meta };
  }
  if (source === 'cc') return { sets: [state.ds], meta: state.meta };
  const vars = modelVars(spec).filter(v => state.meta[v].type !== 'id' && v !== spec.id);
  const ds = singleImpute(state.ds, state.meta, vars, source, { id: spec.id, tvar: spec.tvar });
  let meta = state.meta;
  if (source === 'missind') { meta = { ...state.meta }; vars.forEach(v => { if (meta[v].type === 'cat' && missCount(state.ds.cols[v])) meta[v] = { ...meta[v], levels: [...meta[v].levels, 'Perdido'] }; }); }
  return { sets: [ds], meta };
}
$('#sp-run').addEventListener('click', () => run());
async function run() {
  const out = $('#model-out'); $('#sp-msg').textContent = 'Calculando…'; await tick();
  try {
    const spec = specNow(); state.spec = spec;
    const { sets, meta } = dataSets(spec, state.source);
    state.sets = sets; state.metaX = meta;
    const R = runAnalysis(spec, meta, sets, state.ds); state.R = R; state.sel = null;
    state.Rcc = state.source !== 'cc' && $('#cmp-cc').checked ? runAnalysis(spec, state.meta, [state.ds], state.ds) : null;
    if (state.showCovs == null || state.lastObjective !== spec.objective) state.showCovs = spec.objective !== 'causal';
    state.lastObjective = spec.objective;
    renderResults(); gate();
    $('#sp-msg').textContent = `✓ n = ${R.n}`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error(e); out.innerHTML = errBox(e); $('#sp-msg').textContent = ''; }
}
const srcLabel = s => (s === 'mi' ? `Imputación múltiple (m = ${state.mi?.m})` : SOURCES[s].t);
function renderResults() {
  const R = state.R, spec = R.spec, M = R.M, out = $('#model-out'), N = state.ds.n, causal = spec.objective === 'causal';
  const title = `${TYPES[spec.type].label}${spec.type === 'gee' ? ` (${spec.family}, ${spec.corstr})` : ''}`;
  const yv = spec.type === 'cox' ? spec.status : spec.y, ym = state.meta[yv];
  const nev = ym && ym.type === 'cat' ? R.rows.filter(i => state.sets[0].cols[yv][i] === ym.event).length : null;
  let h = card(`Resultados · ${esc(title)}`, `<p class="small"><b>Desenlace:</b> ${esc(yv)}${nev != null ? ` (evento «${esc(ym.event)}»: ${nev}/${R.n}, ${pct(nev / R.n)})` : ''} · <b>${causal ? 'Variable de intervención' : 'Exposición principal'}:</b> ${esc(spec.exposure || '—')} · <b>n analizado:</b> ${R.n} de ${N}${state.source === 'cc' && R.n < N ? ` (${N - R.n} excluidos por datos perdidos)` : ''} · <b>Datos:</b> ${esc(srcLabel(state.source))}.</p>
    <h3>¿Qué significa?</h3><div class="interp">${spec.exposure ? interpretExposure(R, state.meta) : '<p>No se definió una exposición principal: lea cada fila del forest como la asociación ajustada de esa variable.</p>'}</div>
    ${causal ? '<p class="warn"><b>Falacia de la Tabla 2.</b> Solo el efecto de la variable de intervención tiene interpretación causal. Los coeficientes de los confusores no son sus efectos y no deben interpretarse ni discutirse; por eso se ocultan por defecto.</p>' : ''}
    ${howto(`Para cada variable: número de pacientes (n), ${esc(R.sumHead)}${/^Media|^Mediana/.test(R.sumHead) ? ` de ${esc(yv)}` : ''} en cada grupo y la medida de asociación (${M.measure}) con su IC 95 %. El modelo crudo analiza cada variable sola; el ajustado, todas juntas.`, 'Comparar crudo y ajustado muestra cuánto cambia la asociación al tener en cuenta las demás variables (confusión).', `${M.exp ? `${M.measure} = 1 indica ausencia de asociación; > 1, mayor ${M.measure === 'HR' ? 'riesgo' : 'frecuencia'} que la categoría de referencia; < 1, menor.` : 'β = 0 indica ausencia de asociación; β > 0, valores más altos que la referencia.'} Si el IC cruza la línea punteada, los datos son compatibles con no asociación.`)}
    <div class="row gap wrap"><label class="inline"><input type="checkbox" id="show-crude" checked> Mostrar modelo crudo</label>${spec.exposure ? `<label class="inline"><input type="checkbox" id="show-covs"${state.showCovs ? ' checked' : ''}> Mostrar covariables${causal ? ' (no interpretar)' : ''}</label>` : ''}<span class="grow"></span><button class="ghost" id="tab-doc">Tabla en Word</button><button class="ghost" id="tab-csv">Tabla en CSV</button></div>
    <div id="forest"></div><p class="notes">${M.exp ? `Escala logarítmica; línea de no efecto en ${M.measure} = 1.` : 'Línea de no efecto en β = 0.'} No se informa un valor p global para variables con más de dos categorías: cada categoría se compara con su referencia.${spec.inter.length ? ' Con interacciones, el efecto principal corresponde a la categoría de referencia (o al valor 0) de la otra variable.' : ''}</p>`);
  if (state.Rcc) h += card('Con y sin imputación', `${howto(`El mismo modelo ajustado con ${esc(srcLabel(state.source))} (color) y solo con casos completos (gris).`, 'Ver si los datos perdidos cambian las conclusiones.', 'Si los estimados son parecidos, los resultados son robustos al manejo de perdidos. Si difieren, prefiera la imputación múltiple (bajo MAR) y discútalo.')}<div id="forest-cmp"></div><div id="cmp-text" class="explain"></div>`);
  const est = R.adj.est, D = R.adj.D, mi = R.mi;
  h += card('Coeficientes del modelo ajustado', `<details><summary>Ver tabla completa de coeficientes y ajuste del modelo</summary><div class="tablewrap"><table class="data"><thead><tr><th>Término</th><th class="num">β</th><th class="num">EE${spec.type === 'linear' && spec.robust !== 'none' ? ` (${spec.robust})` : spec.type === 'poisson' || spec.type === 'gee' ? ' robusto' : ''}</th><th class="num">${isFinite(est.df) || mi ? 't' : 'z'}</th><th class="num">p</th><th class="num">${M.measure} (IC 95%)</th>${mi ? '<th class="num">gl</th><th class="num">FMI</th>' : ''}</tr></thead><tbody>${D.cols.map((c, j) => { const [lo, hi] = coefCI(est, j), tr = M.exp && c.term !== '(Intercept)' ? Math.exp : v => v; return `<tr><td>${esc(c.label)}</td><td class="num">${f2(est.beta[j], 4)}</td><td class="num">${f2(est.se[j], 4)}</td><td class="num">${f2(est.stat[j])}</td><td class="num">${fp(est.p[j])}</td><td class="num">${c.term === '(Intercept)' ? '' : `${f2(tr(est.beta[j]))} (${f2(tr(lo))}–${f2(tr(hi))})`}</td>${mi ? `<td class="num">${f2(est.dfj[j], 1)}</td><td class="num">${f2(est.fmi[j], 3)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
    <div class="kpis">${fitStats(R).map(([k, v]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>${mi ? '<p class="notes">FMI: fracción de información perdida por los datos faltantes. gl: grados de libertad de Barnard-Rubin.</p>' : ''}</details>`);
  h += modelExtras(R);
  if (spec.type === 'cox') h += card('Curvas de supervivencia (Kaplan-Meier)', howto('La proporción de pacientes sin el evento a lo largo del tiempo, por grupo; las marcas verticales son censuras.', 'Visualizar cuándo y cuánto difieren los grupos, sin supuestos de modelo.', 'Curvas separadas = distinta supervivencia; la prueba de log-rank compara las curvas completas. Curvas que se cruzan sugieren riesgos no proporcionales.') + '<div id="km"></div>');
  if (spec.type === 'gee' || spec.type === 'lmm') h += card('Trayectorias en el tiempo', howto('El promedio del desenlace en cada visita por grupo (con IC 95 %) y las trayectorias de cada paciente.', 'Ver si los grupos evolucionan distinto (interacción grupo × tiempo).', 'Líneas que se separan con el tiempo indican diferente velocidad de cambio. Las líneas que terminan antes son abandonos.') + '<div class="plots" id="long-plots"></div>');
  if (mi && state.mi) h += card('Sensibilidad a datos perdidos no al azar (MNAR): ajuste δ', `${howto('Se repite la imputación desplazando los valores imputados de una variable en δ (cuantitativas: en sus unidades; binarias: en log-odds).', 'Simular que los pacientes sin dato son sistemáticamente distintos de lo que predice el supuesto MAR.', 'Si el efecto de la exposición se mantiene en todo el rango plausible de δ, la conclusión es robusta. El δ en el que cambia la conclusión es el «punto de inflexión».')}
    <div class="form"><label>Variable <select id="d-var">${state.mi.target.filter(v => state.meta[v].type === 'num' || state.meta[v].levels.length === 2).map(v => opt(v)).join('')}</select></label><label>Valores de δ (separados por coma) <input id="d-vals"></label><label>Imputaciones por δ <input id="d-m" type="number" value="${Math.min(10, state.mi.m)}"></label></div>
    <div class="row gap mt"><button class="primary" id="d-run">Ejecutar</button><span id="d-msg" class="muted small"></span></div><div id="d-out"></div>`);
  h += `<div class="card"><h2>Supuestos del modelo${mi ? ' <span class="sub">(evaluados en la imputación 1)</span>' : ''}</h2>${howto('Cada fila es un supuesto que el modelo necesita para que sus estimados e IC sean válidos, con su resultado y qué hacer si no se cumple.', 'Un modelo con supuestos violados puede dar estimados sesgados o IC demasiado estrechos.', '✓ = supuesto razonable. ⚠ = revise la explicación y los gráficos. Ningún supuesto es «todo o nada»: valore la magnitud del problema.')}<div id="assume"></div><h3>Gráficos de diagnóstico</h3><div class="diag" id="diag-plots"></div>${spec.type === 'gee' ? '<div id="qic"></div>' : ''}</div>`;
  out.innerHTML = h;
  const forestRows = (rows, show) => (show ? rows : rows.filter(r => r.v === spec.exposure || r.inter));
  const drawForest = () => {
    const show = !spec.exposure || ($('#show-covs')?.checked ?? true);
    $('#forest').innerHTML = figWrap(forestTable({ rows: forestRows(R.table, show), measure: M.measure, exp: M.exp, showCrude: $('#show-crude').checked, sumHead: R.sumHead, exposure: spec.exposure, expTag: causal ? 'intervención' : 'exposición' }), `forest_${spec.type}`);
    bindFigs($('#forest'));
    if (state.Rcc) drawCompare(show);
  };
  drawForest(); $('#show-crude').addEventListener('change', drawForest);
  $('#show-covs')?.addEventListener('change', e => { state.showCovs = e.target.checked; drawForest(); });
  $('#tab-doc').addEventListener('click', () => exportTable('doc')); $('#tab-csv').addEventListener('click', () => exportTable('csv'));
  try { renderAssumptions(R); } catch (e) { console.error(e); $('#assume').innerHTML = errBox(e); }
  if (spec.type === 'cox') kmSection(R);
  if (spec.type === 'gee' || spec.type === 'lmm') longPlots(R);
  if (spec.type === 'gee') qicTable(R);
  if (mi && state.mi && $('#d-var')) { const setDef = () => { const v = $('#d-var').value; if (!v) return; const m = state.meta[v]; const s = m.type === 'num' ? sd(Array.from(state.ds.cols[v]).filter(isFinite)) : 1; $('#d-vals').value = (m.type === 'num' ? [-1, -0.5, -0.25, 0, 0.25, 0.5, 1].map(k => +(k * s).toPrecision(3)) : [-2, -1, -0.5, 0, 0.5, 1, 2]).join(', '); }; setDef(); $('#d-var').addEventListener('change', setDef); $('#d-run').addEventListener('click', deltaRun); }
  bindFigs(out);
}
// tablas propias de cada modelo: parte de ceros, umbrales, todas las categorías, efectos aleatorios
function modelExtras(R) {
  const spec = R.spec, est = R.adj.est, mi = R.mi, f = R.adj.fit, fx = (v, d = 2) => (isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d)) : '–');
  const coefRows = (e, cols, exp) => cols.map((c, j) => { const [lo, hi] = coefCI(e, j), tr = exp && c.term !== '(Intercept)' ? Math.exp : v => v; return `<tr><td>${esc(c.label)}</td><td class="num">${fx(e.beta[j], 4)}</td><td class="num">${fx(e.se[j], 4)}</td><td class="num">${fp(e.p[j])}</td><td class="num">${c.term === '(Intercept)' ? '' : `${fx(tr(e.beta[j]))} (${fx(tr(lo))}–${fx(tr(hi))})`}</td></tr>`; }).join('');
  const tbl = (title, note, head, body) => card(title, `${note ? `<p class="small">${note}</p>` : ''}<div class="tablewrap"><table class="data"><thead><tr>${head.map((h, k) => `<th${k ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`);
  let h = '';
  if (est.zero && R.adj.Dz) {
    const hg = spec.type === 'hgamma';
    h += tbl(hg ? 'Parte «¿es positivo?» (logística)' : 'Parte de ceros estructurales (logística)', hg ? 'Modela la probabilidad de que el desenlace sea &gt; 0. OR &gt; 1: mayor probabilidad de un valor positivo.' : 'Modela la probabilidad de ser un cero estructural (la persona no puede tener el evento). OR &gt; 1: mayor probabilidad de ser un cero estructural; el efecto sobre los conteos está en la tabla principal.', ['Término', 'β', 'EE', 'p', 'OR (IC 95%)'], coefRows(est.zero, R.adj.Dz.cols, true));
  }
  if (spec.type === 'ordinal' && !mi) h += tbl('Umbrales y comprobación de odds proporcionales', `Los umbrales son los puntos de corte entre categorías (escala logit). A la derecha, el OR de cada término estimado por separado en cada punto de corte (y &gt; c): si son parecidos entre sí y al OR común, el supuesto de odds proporcionales es razonable.`, ['Punto de corte', 'Umbral', 'EE', ...R.adj.D.terms.map(t => `OR ${esc(t.name)}`).slice(0, 4)], (() => {
    const lv = outLevels(spec, state.metaX || state.meta), cp = ordinalCutpoints(R.adj.D.X, R.adj.y, lv.length);
    return f.thresholds.map((k, c) => `<tr><td>${esc(lv.slice(0, c + 1).join(', '))} | ${esc(lv.slice(c + 1).join(', '))}</td><td class="num">${fx(k, 3)}</td><td class="num">${fx(f.thresholdSE[c], 3)}</td>${R.adj.D.terms.slice(0, 4).map(t => `<td class="num">${cp[c].beta ? t.idx.map(j => fx(Math.exp(cp[c].beta[j]))).join(' / ') : '–'}</td>`).join('')}</tr>`).join('');
  })());
  if (spec.type === 'multinom' && !mi) {
    const lv = outLevels(spec, state.metaX || state.meta), D = R.adj.D;
    h += tbl('Todas las categorías frente a la referencia', `Referencia del desenlace: «${esc(lv[0])}». Cada columna es el RRR (IC 95 %) de ese término para la categoría indicada. Prueba de Wald conjunta de cada variable sobre todas las categorías al final.`, ['Término', ...lv.slice(1).map(l => `${esc(l)} vs ${esc(lv[0])}`)],
      D.cols.map((c, j) => (c.term === '(Intercept)' ? '' : `<tr><td>${esc(c.label)}</td>${f.cats.map(ct => { const [lo, hi] = [ct.beta[j] - 1.96 * ct.se[j], ct.beta[j] + 1.96 * ct.se[j]]; return `<td class="num">${fx(Math.exp(ct.beta[j]))} (${fx(Math.exp(lo))}–${fx(Math.exp(hi))})</td>`; }).join('')}</tr>`)).join('')
      + D.terms.map(t => { const w = f.waldAll(t.idx); return `<tr><td><i>Wald: ${esc(t.name)}</i></td><td class="num" colspan="${lv.length - 1}">χ² = ${fx(w.stat)} (gl ${w.df}); ${fp(w.p)}</td></tr>`; }).join(''));
  }
  if (spec.type === 'glmm' && !mi) h += card('Efectos aleatorios', `<div class="kpis"><div class="kpi"><b>${fx(f.tau2, 3)}</b><span>σ² entre conglomerados</span></div>${isFinite(f.icc) ? `<div class="kpi"><b>${fx(f.icc, 3)}</b><span>CCI (escala latente)</span></div>` : ''}<div class="kpi"><b>${fx(f.mor)}</b><span>OR/RT mediano (MOR)</span></div><div class="kpi"><b>${f.nclust}</b><span>conglomerados (${f.sizeMin}–${f.sizeMax} por conglomerado)</span></div></div><p class="small">El <b>MOR</b> es el cociente mediano entre dos personas idénticas de conglomerados distintos elegidos al azar: ${fx(f.mor)} ⇒ ${f.mor < 1.2 ? 'la pertenencia al conglomerado importa poco' : f.mor < 2 ? 'efecto moderado del conglomerado' : 'efecto grande del conglomerado, comparable a un factor de riesgo fuerte'}.</p>`);
  return h;
}
function drawCompare(show) {
  const R = state.R, C = state.Rcc, spec = R.spec, M = R.M;
  const key = r => `${r.v}|${r.label}`, cc = Object.fromEntries(C.table.map(r => [key(r), r]));
  const rows = R.table.filter(r => show || r.v === spec.exposure || r.inter).map(r => (r.kind === 'head' ? r : { ...r, crude: cc[key(r)]?.adj || null }));
  $('#forest-cmp').innerHTML = figWrap(forestTable({ rows, measure: M.measure, exp: M.exp, showCrude: true, cLabel: 'Casos completos', aLabel: state.source === 'mi' ? 'Imputación múltiple' : 'Imputación simple', legend: [`${srcLabel(state.source)} (n = ${R.n})`, `Casos completos (n = ${C.n})`], exposure: spec.exposure, expTag: spec.objective === 'causal' ? 'intervención' : 'exposición' }), 'forest_con_sin_imputacion');
  bindFigs($('#forest-cmp'));
  const ex = R.table.filter(r => r.v === spec.exposure && r.adj && !r.ref).map(r => { const c = cc[key(r)]?.adj; if (!c) return ''; const ch = M.exp ? (r.adj.est - c.est) / c.est : (r.adj.est - c.est) / Math.abs(c.est || 1); return `<li>${esc(r.label)}: ${M.measure} ${f2(c.est)} (${f2(c.lo)}–${f2(c.hi)}) con casos completos vs ${f2(r.adj.est)} (${f2(r.adj.lo)}–${f2(r.adj.hi)}) con ${esc(srcLabel(state.source).toLowerCase())}; diferencia ${f2(100 * ch, 1)} %.</li>`; }).join('');
  $('#cmp-text').innerHTML = ex ? `<p><b>${esc(spec.exposure)}</b> (n = ${C.n} vs ${R.n}):</p><ul>${ex}</ul>` : '';
}
function exportTable(kind) {
  const R = { ...state.R, hideCovs: state.R.spec.exposure && !state.showCovs }, show = $('#show-crude')?.checked ?? true, Mx = resultsMatrix(R, show), name = `Tabla_${R.spec.type}`;
  if (kind === 'csv') return download(`${name}.csv`, matrixCSV(Mx), 'text/csv');
  const causal = R.spec.objective === 'causal';
  download(`${name}.doc`, wordDoc(`Tabla. ${causal ? `Efecto de ${R.spec.exposure} sobre` : 'Factores asociados a'} ${R.spec.y || R.spec.status}: ${TYPES[R.spec.type].label.toLowerCase()} (${R.M.long})`, matrixHTML(Mx), `${R.M.measure}: ${R.M.long}; IC 95%: intervalo de confianza al 95%. n = ${R.n}.${causal ? ' Ajustado por los confusores indicados en métodos.' : ''}${R.table.some(r => r.sum?.ofVar) ? ' * Variable cuantitativa: distribución de la propia variable.' : ''}`), 'application/msword');
}

// ---------------- supuestos (al final, con explicación) ----------------
const EXPLAIN = [
  [/Colinealidad/, 'Si dos variables miden casi lo mismo (p. ej., TFGe y creatinina), sus efectos no se pueden separar y los IC se inflan.'],
  [/Normalidad/, 'Los IC del modelo lineal suponen residuos aproximadamente normales. Con n > 100–200 este supuesto pierde importancia.'],
  [/Homocedasticidad/, 'La dispersión de los residuos debe ser parecida para valores predichos bajos y altos.'],
  [/Especificación/, 'Comprueba si faltan términos no lineales (curvas) o interacciones.'],
  [/influyentes/, 'Pacientes que por sí solos cambian mucho los resultados; revise si son errores de digitación.'],
  [/Tamaño muestral|EPV/, 'Con pocos eventos por parámetro, los estimados son inestables y el modelo se sobreajusta.'],
  [/Convergencia|separación/, 'Si una categoría tiene 0 % o 100 % de eventos, el modelo no puede estimar su efecto (separación).'],
  [/Linealidad/, 'Las variables cuantitativas se suponen con efecto lineal en la escala del modelo; si no, categorice o use splines.'],
  [/Prevalencia/, 'Con desenlaces frecuentes, el OR se aleja del riesgo relativo y exagera la asociación.'],
  [/Probabilidades predichas/, 'Poisson puede predecir probabilidades > 1; no afecta a la RP/RR, pero el modelo no sirve para predecir.'],
  [/Varianza robusta/, 'Corrige el error estándar de Poisson cuando el desenlace es Sí/No.'],
  [/Sobredispersión/, 'Varianza mayor que la media en conteos: los EE de Poisson quedan demasiado pequeños. Se corrige con binomial negativa o varianza robusta.'],
  [/Ceros observados|Exceso de ceros/, 'Compara cuántos ceros hay con los que el modelo espera. Muchos más ceros que los esperados sugieren ceros estructurales (ZIP/ZINB o hurdle).'],
  [/Vuong/, 'Contrasta si añadir la parte de ceros mejora el ajuste frente al mismo modelo sin ella. Es una prueba orientativa, no definitiva.'],
  [/Parámetro de dispersión|Binomial negativa vs/, 'α mide cuánto excede la varianza a la media; α = 0 equivale a Poisson.'],
  [/Odds proporcionales/, 'El modelo ordinal supone que el OR es el mismo en todos los puntos de corte de la escala; si cambia mucho, un único OR engaña.'],
  [/Pacientes por categoría/, 'Las categorías con pocos pacientes hacen inestables los coeficientes; agrúpelas si es clínicamente razonable.'],
  [/IIA|alternativas irrelevantes/, 'Supuesto del modelo multinomial logit: añadir o quitar una categoría no cambia las razones entre las demás.'],
  [/Dispersión φ|asimetría/, 'Gamma supone que la variabilidad crece con la media (CV constante); residuos muy asimétricos indican otra distribución.'],
  [/Desenlace estrictamente positivo|Desenlace: conteo/, 'Comprobación de que el desenlace tiene la forma que exige el modelo.'],
  [/Riesgos proporcionales/, 'El HR debe ser constante en el tiempo; si cambia, un único HR resume mal el efecto.'],
  [/conglomerados|sujetos/, 'El error estándar robusto necesita suficientes pacientes (≥ 40 recomendado).'],
  [/Correlación de trabajo/, 'Cómo se parecen las mediciones repetidas de un mismo paciente; compare estructuras con el QIC.'],
  [/Efecto aleatorio/, 'Mide cuánto se parecen las mediciones de un mismo paciente (CCI); si es alto, el modelo mixto es necesario.'],
];
const explain = n => (EXPLAIN.find(([re]) => re.test(n)) || [, ''])[1];
function renderAssumptions(R) {
  const spec = R.spec, A = assumptions(spec, R.adj), f = R.adj.fit, P = [];
  $('#assume').innerHTML = `<div class="tablewrap"><table class="data chk"><thead><tr><th></th><th>Supuesto y resultado</th><th>¿Qué evalúa?</th><th>Interpretación / qué hacer</th></tr></thead><tbody>${A.checks.map(c => `<tr><td class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '⚠'}</td><td><b>${esc(c.name)}</b><br><span class="sub">${esc(c.value)}</span></td><td class="sub">${esc(explain(c.name))}</td><td>${esc(c.note)}</td></tr>`).join('')}</tbody></table></div>`;
  const add = (svg, name, text) => P.push(`<div class="item">${figWrap(svg, name)}<p>${text}</p></div>`);
  const p = R.adj.D.X[0].length;
  if (A.extra.vif && A.extra.vif.length > 1) add(vifPlot(A.extra.vif), 'colinealidad', 'Cada barra es el factor de inflación de la varianza de una variable. Por debajo de 5 no hay problema; entre 5 y 10, colinealidad moderada; ≥ 10, alta (considere retirar una de las variables redundantes).');
  if (spec.type === 'linear' || spec.type === 'lmm') {
    const res = spec.type === 'linear' ? Array.from(f.resid) : Array.from(f.cond), s = sd(res), rs = spec.type === 'linear' ? Array.from(f.rstd) : res.map(v => v / s);
    add(scatterPlot({ x: f.fitted, y: res, xlab: 'Valores ajustados', ylab: 'Residuos', title: 'Linealidad', sub: 'La línea de referencia debe ser plana y horizontal', hline: 0, smooth: lowess(f.fitted, res) }), 'linealidad', 'Si la línea burdeos se curva, la relación no es lineal: pruebe términos cuadráticos, splines o transformar variables.');
    const sq = rs.map(v => Math.sqrt(Math.abs(v)));
    add(scatterPlot({ x: f.fitted, y: sq, xlab: 'Valores ajustados', ylab: '√|residuo estandarizado|', title: 'Homogeneidad de varianza', sub: 'La línea de referencia debe ser plana y horizontal', smooth: lowess(f.fitted, sq) }), 'homocedasticidad', 'Si la línea sube o baja, la variabilidad cambia con el valor predicho (heterocedasticidad): use errores estándar robustos (HC3).');
    if (spec.type === 'linear') add(leveragePlot(f.hat, f.rstd, p), 'influyentes', 'Los puntos fuera de las curvas de Cook (0.5 y 1) influyen mucho en los resultados. Los números indican la fila de los más influyentes: revíselos y, si no son errores, repita el análisis sin ellos como sensibilidad.');
    add(qqPlot(rs), 'qq', 'Si los puntos se alejan de la línea en los extremos, los residuos tienen colas más pesadas que la normal (valores extremos o asimetría).');
    add(densityPlot(res), 'densidad_residuos', 'La forma sombreada (residuos) debe parecerse a la curva normal (burdeos). Una cola larga indica asimetría.');
    if (spec.type === 'lmm' && f.blup) add(qqPlot([...f.blup.values()], 'Normalidad de efectos aleatorios', 'Los interceptos de cada paciente deben seguir la línea'), 'qq_efectos_aleatorios', 'El modelo mixto supone que las diferencias entre pacientes siguen una distribución normal.');
  }
  if (spec.type === 'logistic') {
    add(binnedResidPlot(f.fitted, R.adj.y), 'residuos_agrupados', 'Se agrupan los pacientes por riesgo predicho y se promedia el residuo. Más del 5 % de puntos fuera de las bandas sugiere mala especificación.');
    add(leveragePlot(f.hat, Array.from(f.pres, (r, i) => r / Math.sqrt(1 - f.hat[i])), p), 'influyentes', 'Pacientes fuera de las curvas de Cook influyen mucho en los OR.');
  }
  if (['nb', 'zip', 'zinb', 'gamma', 'hgamma', 'glmm'].includes(spec.type)) {
    const fit = spec.type === 'hgamma' ? f.fittedPos : f.fitted, yy = R.adj.y, r = f.pres || Array.from(f.fitted, (m, i) => (f.resid ? f.resid[i] : yy[i] - m) / Math.sqrt(Math.max(spec.type === 'glmm' && spec.family !== 'poisson' ? m * (1 - m) : f.mu?.[i] ?? m, 1e-9)));
    if (spec.type !== 'hgamma' || f.pres) add(scatterPlot({ x: fit, y: r, xlab: 'Valores ajustados', ylab: 'Residuo de Pearson', title: 'Residuos vs ajustados', sub: 'La línea debe ser plana y horizontal', hline: 0, smooth: lowess(fit, r) }), 'residuos_vs_ajustados', 'Una curva sistemática indica mala especificación (falta una curva, una interacción o la distribución es otra). En los modelos de conteo, residuos que se abren con el valor ajustado indican sobredispersión.');
  }
  if (spec.type === 'poisson' || spec.type === 'count') {
    add(scatterPlot({ x: f.fitted, y: f.pres, xlab: 'Valores ajustados', ylab: 'Residuo de Pearson', title: 'Residuos vs ajustados', sub: 'La línea debe ser plana y horizontal', hline: 0, smooth: lowess(f.fitted, f.pres) }), 'residuos', 'Con desenlaces Sí/No los residuos forman dos bandas (es normal); lo importante es que la línea sea plana.');
    add(leveragePlot(f.hat, Array.from(f.pres, (r, i) => r / Math.sqrt(1 - f.hat[i])), p), 'influyentes', 'Pacientes fuera de las curvas de Cook influyen mucho en las razones estimadas.');
  }
  if (['linear', 'logistic', 'poisson', 'count'].includes(spec.type)) spec.numVars.slice(0, 4).forEach(v => {
    const j = R.adj.D.cols.findIndex(c => c.term === v); if (j < 0) return;
    const x = R.adj.D.X.map(r => r[j]), res = spec.type === 'linear' ? f.resid : Array.from(f.resid, (r, i) => r / (spec.type === 'logistic' ? f.fitted[i] * (1 - f.fitted[i]) : f.fitted[i]));
    const pr = x.map((xi, i) => res[i] + f.beta[j] * xi);
    add(scatterPlot({ x, y: pr, xlab: v, ylab: 'Residuo parcial', title: `Linealidad de ${v}`, sub: 'La curva burdeos debe seguir la recta gris', smooth: lowess(x, pr), line: [[Math.min(...x), f.beta[j] * Math.min(...x)], [Math.max(...x), f.beta[j] * Math.max(...x)]] }), `linealidad_${v}`, `Si la curva se aleja de la recta, el efecto de ${esc(v)} no es lineal en la escala del modelo: considere categorizarla o usar splines.`);
  });
  if (spec.type === 'cox' && A.extra.zph) {
    const z = A.extra.zph; R.adj.D.cols.slice(0, 8).forEach((c, j) => add(schoenfeldPlot(z, j, c.label, lowess(z.times, z.scaled.map(r => r[j]))), `schoenfeld_${c.label}`, `Muestra cómo cambiaría el log(HR) de «${esc(c.label)}» en el tiempo. Una línea plana indica riesgos proporcionales; una pendiente clara, que el efecto cambia con el tiempo (p = ${fp(z.per[j].p)}).`));
  }
  if (spec.type === 'gee') add(scatterPlot({ x: f.fitted, y: f.resid, xlab: 'Valores ajustados', ylab: 'Residuo', title: 'Residuos vs ajustados', sub: 'La línea debe ser plana y horizontal', hline: 0, smooth: lowess(f.fitted, f.resid) }), 'residuos_gee', 'Una curva indica que la forma de la relación con el tiempo u otras variables no está bien especificada.');
  $('#diag-plots').innerHTML = P.join('');
  bindFigs($('#diag-plots'));
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
    `<table class="data"><thead><tr><th>Grupo</th><th class="num">n</th><th class="num">Eventos</th><th class="num">Mediana (IC 95%)</th>${lr ? '<th class="num">Observados</th><th class="num">Esperados</th>' : ''}</tr></thead><tbody>${curves.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${c.k.n}</td><td class="num">${c.k.events}</td><td class="num">${isFinite(c.k.median) ? `${f2(c.k.median, 1)} (${f2(c.k.medianCI[0], 1)}–${isFinite(c.k.medianCI[1]) ? f2(c.k.medianCI[1], 1) : 'NE'})` : 'no alcanzada'}</td>${lr ? `<td class="num">${lr.O[lr.levels.indexOf(c.label)]}</td><td class="num">${f2(lr.E[lr.levels.indexOf(c.label)], 1)}</td>` : ''}</tr>`).join('')}</tbody></table><p class="notes">Mediana: tiempo en que la mitad de los pacientes tuvo el evento («no alcanzada» si nunca llegó al 50 %). NE: no estimable.</p>`;
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
  const rows = ['independence', 'exchangeable', 'ar1'].map(cs => { try { const r = fitModel({ ...R.spec, corstr: cs }, state.sets[0], state.metaX, termsOf(R.spec), R.rows); return { cs, qic: r.fit.qic, a: r.fit.alpha }; } catch (e) { return { cs, err: e.message }; } });
  const best = rows.filter(r => isFinite(r.qic)).sort((a, b) => a.qic - b.qic)[0]?.cs, name = { independence: 'Independencia', exchangeable: 'Intercambiable', ar1: 'AR(1)' };
  $('#qic').innerHTML = `<h3>Elección de la correlación de trabajo (QIC)</h3><p class="sub">Menor QIC = estructura más adecuada. Los errores estándar robustos son válidos aunque la estructura no sea la correcta.</p><table class="data"><thead><tr><th>Estructura</th><th class="num">α</th><th class="num">QIC</th></tr></thead><tbody>${rows.map(r => `<tr><td>${name[r.cs]}${r.cs === best ? ' <span class="flag">menor QIC</span>' : ''}</td><td class="num">${f2(r.a, 3)}</td><td class="num">${f2(r.qic, 1)}</td></tr>`).join('')}</tbody></table>`;
}
async function deltaRun() {
  const R = state.R, spec = R.spec, v = $('#d-var').value, vals = $('#d-vals').value.split(',').map(Number).filter(isFinite), m = Math.max(2, +$('#d-m').value || 5);
  if (!v) { $('#d-out').innerHTML = errBox('No hay variables imputadas cuantitativas o binarias.'); return; }
  const E = spec.exposure; if (!E) { $('#d-out').innerHTML = errBox('Defina una exposición principal.'); return; }
  const msg = $('#d-msg'), pts = [];
  for (const [k, d] of vals.entries()) {
    msg.textContent = `δ = ${d} (${k + 1}/${vals.length})…`; await tick();
    try {
      const mi = await mice(state.ds, state.meta, { vars: state.mi.vars, m, maxit: state.mi.maxit, seed: state.mi.seed, methods: state.mi.method, delta: { v, value: d } });
      const P = fitPooled(spec, mi.imps, state.meta, termsOf(spec), R.rows), j = P.D.cols.findIndex(c => c.term === E);
      const [lo, hi] = coefCI(P.est, j), tr = R.M.exp ? Math.exp : x => x;
      pts.push({ delta: d, est: tr(P.est.beta[j]), lo: tr(lo), hi: tr(hi), p: P.est.p[j], label: P.D.cols[j].label });
    } catch (e) { $('#d-out').innerHTML = errBox(e); return; }
  }
  msg.textContent = ''; state.delta = true;
  const flip = pts.filter(p => p.p < 0.05).length, lab = pts[0]?.label;
  $('#d-out').innerHTML = figWrap(tippingPlot(pts, { xlab: `δ aplicado a los imputados de ${v}`, measure: `${R.M.measure} de ${lab}`, exp: R.M.exp }), 'sensibilidad_delta') + `<table class="data"><thead><tr><th class="num">δ</th><th class="num">${R.M.measure} (IC 95%)</th><th class="num">p</th></tr></thead><tbody>${pts.map(p => `<tr><td class="num">${p.delta}</td><td class="num">${f2(p.est)} (${f2(p.lo)}–${f2(p.hi)})</td><td class="num">${fp(p.p)}</td></tr>`).join('')}</tbody></table><p class="small">${flip === pts.length ? 'La asociación se mantiene en todo el rango de δ: conclusión robusta a MNAR en ese rango.' : flip === 0 ? 'La asociación no es estadísticamente significativa en ningún escenario.' : 'La conclusión cambia dentro del rango de δ: los resultados son sensibles a MNAR (hay un punto de inflexión).'} Círculos rellenos: p &lt; 0.05.</p>`;
  bindFigs($('#d-out'));
}

// ---------------- 7 · modelización ----------------
const selData = () => ({ ds: state.sets[0], rows: state.R.rows, meta: state.metaX });
function renderSelCtx() {
  if (!state.R) return; const s = state.R.spec;
  $('#sel-ctx').innerHTML = `Modelo del paso 6: <b>${esc(TYPES[s.type].label)}</b>; desenlace <b>${esc(s.y || s.status)}</b>; ${s.objective === 'causal' ? 'intervención' : 'exposición'} (siempre en el modelo) <b>${esc(s.exposure || '—')}</b>; ${s.covs.length} covariables candidatas. n = ${state.R.n}${state.R.mi ? ' (selección en la imputación 1)' : ''}.${s.objective === 'causal' ? ' <span class="flag">Pregunta causal: use la selección automática solo como exploración.</span>' : ''}`;
}
$('#sel-run').addEventListener('click', () => {
  const spec = { ...state.R.spec, inter: [] }, { ds, rows, meta } = selData(), st = 'purposeful', o = $('#sel-out');
  try {
    const r = purposeful(spec, ds, meta, rows, { pEnter: +$('#sel-pin').value, pStay: +$('#sel-pout').value, delta: +$('#sel-delta').value });
    state.sel = { ...r, strategy: st };
    o.innerHTML = `<ol class="log">${r.log.map(l => `<li>${esc(l.text)}${l.table ? `<table class="data mt"><thead><tr><th>Variable</th><th class="num">p bivariado</th><th></th></tr></thead><tbody>${l.table.map(t => `<tr><td>${esc(t[0])}</td><td class="num">${t[1]}</td><td>${t[2]}</td></tr>`).join('')}</tbody></table>` : ''}</li>`).join('')}</ol><p><b>Covariables seleccionadas:</b> ${esc(r.covs.join(', ') || 'ninguna')}</p>`;
    $('#sel-apply').hidden = false;
  } catch (e) { o.innerHTML = errBox(e); }
});
$('#sel-apply').addEventListener('click', () => {
  if (!state.sel) return;
  const s = state.R.spec;
  state.inter = s.inter.filter(p => p.every(v => v === s.exposure || state.sel.covs.includes(v)));
  state.draft = { ...s, covs: state.sel.covs, inter: state.inter };
  state.selection = 'la estrategia de selección intencionada de Hosmer y Lemeshow (Bursac et al. 2008)';
  renderSpecForm(); showTab('modelos'); run();
});
$('#cie-run').addEventListener('click', () => {
  const spec = { ...state.R.spec, inter: [] }, { ds, rows, meta } = selData(), o = $('#cie-out');
  if (!spec.exposure) { o.innerHTML = errBox('Defina una exposición principal en el paso 3.'); return; }
  try {
    const r = changeInEstimate(spec, ds, meta, rows, +$('#cie-thr').value || 0.1), M = measureOf(spec);
    o.innerHTML = `<p class="small">${M.measure} de ${esc(spec.exposure)}: crudo ${r.crude.map(e => `${esc(e.label)} = ${f2(e.est)}`).join('; ')} · ajustado por todas ${r.full.map(e => `${esc(e.label)} = ${f2(e.est)}`).join('; ')}.</p><table class="data"><thead><tr><th>Covariable retirada</th><th>${M.measure} de la exposición sin ella</th><th class="num">Cambio</th><th>Juicio</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.v)}</td><td>${x.effects.map(e => `${esc(e.label)}: ${f2(e.est)}`).join('; ')}</td><td class="num">${pct(x.max)}</td><td>${x.conf ? '<span class="flag">confusor</span>' : '—'}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { o.innerHTML = errBox(e); }
});
$('#em-run').addEventListener('click', () => {
  const spec = { ...state.R.spec, inter: [] }, { ds, rows, meta } = selData(), o = $('#em-out'), M = measureOf(spec);
  if (!spec.exposure) { o.innerHTML = errBox('Defina una exposición principal en el paso 3.'); return; }
  try {
    const r = effectModification(spec, ds, meta, rows);
    o.innerHTML = `<div class="tablewrap"><table class="data"><thead><tr><th>Exposición × covariable</th><th class="num">p de interacción</th><th>${M.measure} de la exposición en cada estrato (IC 95%)</th><th></th></tr></thead><tbody>${r.map(x => x.error ? `<tr><td>${esc(spec.exposure)} × ${esc(x.v)}</td><td colspan="3" class="sub">no estimable: ${esc(x.error)}</td></tr>` : `<tr><td>${esc(spec.exposure)} × ${esc(x.v)}</td><td class="num${x.p < 0.05 ? ' b' : ''}">${fp(x.p)}</td><td class="sub" style="white-space:normal">${x.strata.map(s => `${esc(s.stratum)} · ${esc(s.exposure)}: ${!isFinite(s.est) || !isFinite(s.hi) || (M.exp && s.hi / s.lo > 1e3) ? '<i>no estimable (pocos eventos)</i>' : `${f2(s.est)} (${f2(s.lo)}–${f2(s.hi)})`}`).join('<br>')}</td><td><button class="ghost" data-add="${esc(x.v)}">Añadir</button></td></tr>`).join('')}</tbody></table></div>`;
    o.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { state.inter = [...state.R.spec.inter, [spec.exposure, b.dataset.add]]; state.draft = { ...state.R.spec, inter: state.inter }; renderSpecForm(); showTab('modelos'); run(); }));
  } catch (e) { o.innerHTML = errBox(e); }
});
// ---------------- 8 · reporte ----------------
$$('[data-lang]').forEach(b => b.addEventListener('click', () => { state.lang = b.dataset.lang; renderReport(); }));
$('#meth-copy').addEventListener('click', () => { const t = $('#methods'); try { navigator.clipboard.writeText(t.value).catch(() => t.select()); } catch { t.select(); } });
$('#rep-doc').addEventListener('click', () => state.R && exportTable('doc'));
$('#rep-csv').addEventListener('click', () => state.R && exportTable('csv'));
function renderReport() {
  if (!state.R) return; const R = state.R, src = state.source;
  const ctx = { source: src === 'cc' ? 'cc' : src === 'mi' ? 'mi' : 'simple', simpleLabel: SOURCES[src], compare: !!state.Rcc, N: state.ds.n, mi: state.mi, little: state.little, delta: state.delta, selection: state.selection, event: state.meta[R.spec.y]?.event };
  $('#methods').value = methodsText(R, ctx, state.lang);
  $('#rep-table').innerHTML = `<div class="tablewrap tall">${matrixHTML(resultsMatrix({ ...R, hideCovs: R.spec.exposure && !state.showCovs }, true)).replace('<table>', '<table class="data">')}</div>${R.spec.objective === 'causal' && !state.showCovs ? '<p class="notes">Se muestran solo los efectos de la intervención (falacia de la Tabla 2). Active «Mostrar covariables» en el paso 6 para incluirlas.</p>' : ''}`;
}
gate();
