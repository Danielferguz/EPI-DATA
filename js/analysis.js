// Orquestación: especificación del modelo → ajuste crudo y ajustado (casos completos o imputación múltiple) → tabla para el forest.
import { design, response, completeRows, levelsOf, levelCounts, isMiss } from './data.js?v=2026.10.16-2';
import { fitOLS, fitGLM, fitCox, fitGEE, fitLMM, ciOf, waldTerm } from './models.js?v=2026.10.16-2';
import { pool, poolWald, pooledCI } from './missing.js?v=2026.10.16-2';
import { shapiro, mean as avg, sd as sdv, quantile } from './tests.js?v=2026.10.16-2';
import { quadForm } from './linalg.js?v=2026.10.16-2';
import { qnorm, qt, p2z, p2t } from './dist.js?v=2026.10.16-2';

export const TYPES = {
  linear: { label: 'Regresión lineal', short: 'Lineal', exp: false, measure: 'β', measureLong: 'Coeficiente β' },
  logistic: { label: 'Regresión logística', short: 'Logística', exp: true, measure: 'OR', measureLong: 'Odds ratio' },
  poisson: { label: 'Poisson con varianza robusta', short: 'Poisson robusta', exp: true, measure: 'RP', measureLong: 'Razón de prevalencias' },
  cox: { label: 'Supervivencia: regresión de Cox', short: 'Cox', exp: true, measure: 'HR', measureLong: 'Hazard ratio' },
  gee: { label: 'Longitudinal: GEE', short: 'GEE', exp: null, measure: null, measureLong: null },
  lmm: { label: 'Longitudinal: modelo lineal mixto', short: 'Modelo mixto', exp: false, measure: 'β', measureLong: 'Coeficiente β (efectos fijos)' },
};
export function measureOf(spec) {
  if (spec.type === 'gee') return spec.family === 'gaussian' ? { exp: false, measure: 'β', long: 'Coeficiente β' } : spec.family === 'binomial' ? { exp: true, measure: 'OR', long: 'Odds ratio' } : { exp: true, measure: spec.measureLabel || 'RR', long: 'Razón de tasas/riesgos' };
  if (spec.type === 'poisson') { const m = spec.measureLabel || 'RP'; return { exp: true, measure: m, long: { RP: 'Razón de prevalencias', RR: 'Riesgo relativo', RTI: 'Razón de tasas de incidencia' }[m] }; }
  const t = TYPES[spec.type]; return { exp: t.exp, measure: t.measure, long: t.measureLong };
}

export const modelVars = spec => [...new Set([spec.y, spec.time, spec.status, spec.id, spec.tvar, spec.offset, spec.exposure, ...(spec.covs || []), ...(spec.inter || []).flat()].filter(Boolean))];
export const termsOf = (spec, covs = spec.covs) => [...(spec.exposure ? [spec.exposure] : []), ...covs].map(v => ({ vars: [v] })).concat((spec.inter || []).filter(p => p.every(v => v === spec.exposure || covs.includes(v))).map(p => ({ vars: p })));

// ajuste de un modelo en un conjunto de datos y filas
export function fitModel(spec, ds, meta, terms, rows) {
  if (spec.type === 'gee' || spec.type === 'lmm') {
    // orden por sujeto y tiempo (necesario para AR-1)
    const id = ds.cols[spec.id], t = spec.tvar ? ds.cols[spec.tvar] : null;
    rows = [...rows].sort((a, b) => (String(id[a]) < String(id[b]) ? -1 : String(id[a]) > String(id[b]) ? 1 : t ? (+t[a] || 0) - (+t[b] || 0) : a - b));
  }
  const D = design(ds, meta, terms, rows, { intercept: spec.type !== 'cox' });
  let fit, y = null, time = null, status = null;
  if (spec.type === 'cox') {
    time = response(ds, meta[spec.time], rows); status = response(ds, meta[spec.status], rows);
    if (!terms.length) return { fit: null, D, time, status, rows };
    fit = fitCox(D.X, time, status);
  } else {
    y = response(ds, meta[spec.y], rows);
    if (spec.type === 'linear') fit = fitOLS(D.X, y, { robust: spec.robust || 'none' });
    else if (spec.type === 'logistic') fit = fitGLM(D.X, y, 'binomial');
    else if (spec.type === 'poisson') fit = fitGLM(D.X, y, 'poisson', { robust: true, offset: spec.offset ? Float64Array.from(rows, i => Math.log(ds.cols[spec.offset][i])) : null });
    else if (spec.type === 'gee') fit = fitGEE(D.X, y, rows.map(i => ds.cols[spec.id][i]), spec.family || 'gaussian', spec.corstr || 'exchangeable');
    else if (spec.type === 'lmm') fit = fitLMM(D.X, y, rows.map(i => ds.cols[spec.id][i]));
  }
  return { fit, D, y, time, status, rows };
}

// gl de datos completos para Rubin (como mice: gl residuales de MCO/MLG)
const dfcom = (spec, R) => (['linear', 'logistic', 'poisson'].includes(spec.type) ? R.D.X.length - R.D.X[0].length : Infinity);

// ajusta en uno o varios conjuntos (imputación múltiple) y combina
export function fitPooled(spec, sets, meta, terms, rows) {
  const Rs = sets.map(ds => fitModel(spec, ds, meta, terms, rows));
  if (Rs.length === 1) return { ...Rs[0], est: Rs[0].fit, all: Rs };
  const P = pool(Rs.map(r => r.fit), dfcom(spec, Rs[0]));
  return { ...Rs[0], est: P, all: Rs };
}
export const coefCI = (est, j) => (est.pooled ? pooledCI(est, j) : ciOf(est, j));
export const termTest = (est, idx) => (est.pooled ? poolWald(est, idx) : waldTerm(est, idx));

// análisis completo: modelo ajustado + modelos crudos (una variable a la vez) en la misma muestra
export function runAnalysis(spec, meta, sets, obs = sets[0]) {
  const vars = modelVars(spec), rows = completeRows(sets[0], vars);
  if (spec.type === 'cox' && rows.some(i => !(sets[0].cols[spec.time][i] > 0))) throw new Error('El tiempo de seguimiento debe ser > 0 en todas las filas.');
  if (rows.length < 10) throw new Error(`Solo ${rows.length} filas completas para las variables del modelo.`);
  const terms = termsOf(spec), adj = fitPooled(spec, sets, meta, terms, rows);
  const crude = {};
  for (const v of [spec.exposure, ...spec.covs].filter(Boolean)) crude[v] = fitPooled(spec, sets, meta, [{ vars: [v] }], rows);
  const M = measureOf(spec);
  return { spec, M, rows, n: rows.length, adj, crude, table: buildTable(spec, meta, sets[0], rows, adj, crude, M, obs, sets.length === 1 && obs === sets[0] ? rows : null), sumHead: summaryHead(spec, meta, obs), mi: sets.length > 1, m: sets.length };
}

function effect(est, D, j, M) {
  if (j < 0) return null;
  const [lo, hi] = coefCI(est, j), b = est.beta[j], tr = M.exp ? Math.exp : v => v;
  return { b, est: tr(b), lo: tr(lo), hi: tr(hi), p: est.p[j], se: est.se[j], fmi: est.fmi?.[j] };
}
// resumen descriptivo del desenlace en cada grupo (columna del forest): n/N (%) o media ± DE / mediana (P25–P75)
const outKind = (spec, meta) => (spec.type === 'cox' ? 'bin' : meta[spec.y].type === 'cat' ? 'bin' : 'num');
const normalish = a => { if (a.length < 3) return true; const sw = shapiro(a.slice(0, 5000)), m = avg(a), s = sdv(a), sk = a.reduce((t, v) => t + ((v - m) / s) ** 3, 0) / a.length; return sw.p >= 0.05 || (a.length > 200 && Math.abs(sk) < 1); };
const f1 = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
const descr = (a, normal) => (!a.length ? '–' : normal ? `${f1(avg(a))} ± ${a.length > 1 ? f1(sdv(a)) : '–'}` : `${f1(quantile(a, 0.5))} (${f1(quantile(a, 0.25))}–${f1(quantile(a, 0.75))})`);
function summaryHead(spec, meta, obs) {
  const yv = spec.type === 'cox' ? spec.status : spec.y, m = meta[yv];
  if (outKind(spec, meta) === 'bin') return `${String(m.event).length <= 3 ? `${yv} = ${m.event}` : m.event}, n/N (%)`;
  const y = Array.from(obs.cols[yv]).filter(v => !isMiss(v));
  return normalish(y) ? 'Media ± DE' : 'Mediana (P25–P75)';
}
function groupSummary(spec, meta, obs, v, level, sub = null) {
  const yv = spec.type === 'cox' ? spec.status : spec.y, ym = meta[yv], yc = obs.cols[yv], xc = obs.cols[v];
  const idx = []; for (const i of sub || obs.cols[yv].keys()) if (!isMiss(yc[i]) && !isMiss(xc[i]) && (level == null || xc[i] === level)) idx.push(i);
  if (meta[v].type === 'num') { const x = idx.map(i => xc[i]); return { text: descr(x, normalish(x)), ofVar: true }; }
  if (outKind(spec, meta) === 'bin') { const e = idx.filter(i => String(yc[i]) === String(ym.event)).length; return { text: `${e}/${idx.length} (${idx.length ? (100 * e / idx.length).toFixed(1) : '–'}%)` }; }
  const all = []; for (let i = 0; i < obs.n; i++) if (!isMiss(yc[i])) all.push(yc[i]);
  return { text: descr(idx.map(i => yc[i]), normalish(all)) };
}
function buildTable(spec, meta, ds, rows, adj, crude, M, obs = ds, sub = null) {
  const out = [], gs = (v, l) => { try { return groupSummary(spec, meta, obs, v, l, sub); } catch { return null; } };
  for (const v of [spec.exposure, ...spec.covs].filter(Boolean)) {
    const m = meta[v], C = crude[v], tA = adj.D.terms.find(t => t.name === v), tC = C.D.terms.find(t => t.name === v);
    const head = { kind: 'head', v, label: v, exposure: v === spec.exposure };
    out.push(head);
    if (m.type === 'num') {
      out.push({ kind: 'row', v, label: `por 1 unidad`, n: rows.length, sum: gs(v, null), crude: effect(C.est, C.D, C.D.cols.findIndex(c => c.term === v), M), adj: effect(adj.est, adj.D, adj.D.cols.findIndex(c => c.term === v), M) });
    } else {
      const cnt = levelCounts(ds, m, rows);
      levelsOf(m).forEach((l, k) => {
        if (k === 0) { out.push({ kind: 'row', v, label: l, n: cnt[l] || 0, ref: true, sum: gs(v, l) }); return; }
        const jC = C.D.cols.findIndex(c => c.term === v && c.levels[0] === l), jA = adj.D.cols.findIndex(c => c.term === v && c.levels[0] === l);
        out.push({ kind: 'row', v, label: l, n: cnt[l] || 0, sum: gs(v, l), crude: effect(C.est, C.D, jC, M), adj: effect(adj.est, adj.D, jA, M) });
      });
    }
  }
  const inter = adj.D.terms.filter(t => t.vars.length > 1);
  if (inter.length) {
    out.push({ kind: 'head', v: '_inter', label: 'Interacciones' });
    inter.forEach(t => t.idx.forEach(j => out.push({ kind: 'row', v: t.name, label: adj.D.cols[j].label, n: NaN, crude: null, adj: effect(adj.est, adj.D, j, M), inter: true })));
  }
  return out;
}

// combinación lineal de coeficientes (efecto de la exposición dentro de un estrato del modificador)
export function lincom(est, w, M) {
  const idx = Object.keys(w).map(Number), b = idx.reduce((s, j) => s + w[j] * est.beta[j], 0);
  let v = 0; idx.forEach(a => idx.forEach(c => { v += w[a] * w[c] * est.V[a][c]; }));
  const se = Math.sqrt(v), df = est.pooled ? Math.min(...idx.map(j => est.dfj[j])) : est.df;
  const q = isFinite(df) ? qt(0.975, df) : qnorm(0.975), tr = M.exp ? Math.exp : x => x;
  return { est: tr(b), lo: tr(b - q * se), hi: tr(b + q * se), p: isFinite(df) ? p2t(b / se, df) : p2z(b / se) };
}

export const fitStats = R => {
  const f = R.adj.est;
  if (R.mi) return [['Imputaciones (m)', R.m], ['n', R.n]];
  const s = [['n', R.n]];
  if (f.model === 'ols') s.push(['R²', f.r2.toFixed(3)], ['R² ajustado', f.adjR2.toFixed(3)], ['F (gl)', `${f.F.toFixed(2)} (${f.Fdf.join(', ')})`], ['σ residual', f.sigma.toFixed(3)], ['AIC', f.aic.toFixed(1)], ['BIC', f.bic.toFixed(1)]);
  if (f.model === 'binomial' || f.model === 'poisson') {
    const lr = 2 * (f.ll - f.ll0), n = R.n; s.push(['Log-verosimilitud', f.ll.toFixed(2)], ['χ² de razón de verosimilitud vs nulo', lr.toFixed(2)], ['AIC', f.aic.toFixed(1)], ['BIC', f.bic.toFixed(1)]);
    if (f.model === 'binomial') { const mcf = 1 - f.ll / f.ll0, cs = 1 - Math.exp(-lr / n), nag = cs / (1 - Math.exp(2 * f.ll0 / n)); s.push(['R² de McFadden', mcf.toFixed(3)], ['R² de Nagelkerke', nag.toFixed(3)]); }
  }
  if (f.model === 'cox') s.push(['Eventos', f.nevent], ['Log-verosimilitud parcial', f.ll.toFixed(2)], ['Razón de verosimilitud (p)', `${f.lr.toFixed(2)} (${f.lrP < 0.001 ? '<0.001' : f.lrP.toFixed(3)})`], ['Score / log-rank (p)', `${f.score.toFixed(2)} (${f.scoreP < 0.001 ? '<0.001' : f.scoreP.toFixed(3)})`], ['AIC', f.aic.toFixed(1)]);
  if (f.model === 'gee') s.push(['Sujetos (conglomerados)', f.nclust], ['Correlación de trabajo', `${f.corstr} (α = ${f.alpha.toFixed(3)})`], ['Escala φ', f.phi.toFixed(3)], ['QIC', f.qic.toFixed(1)], ['QICu', f.qicu.toFixed(1)]);
  if (f.model === 'lmm') s.push(['Sujetos', f.nclust], ['σ² entre sujetos (τ²)', f.tau2.toFixed(3)], ['σ² residual', f.sigma2.toFixed(3)], ['CCI', f.icc.toFixed(3)], ['Log-verosimilitud REML', f.llREML.toFixed(2)], ['AIC (REML)', f.aic.toFixed(1)]);
  return s;
};
export { quadForm };
