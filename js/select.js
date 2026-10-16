// Modelización multivariable: selección intencionada, eliminación hacia atrás (AIC/QIC o p),
// cambio en el estimado (confusión) y modificación de efecto (interacciones).
import { fitModel, termsOf, measureOf, lincom } from './analysis.js?v=2026.10.16-2';
import { waldTerm } from './models.js?v=2026.10.16-2';
import { levelsOf } from './data.js?v=2026.10.16-2';
import { quantile } from './tests.js?v=2026.10.16-2';

const termP = (R, v) => { const t = R.D.terms.find(t => t.name === v); return t ? waldTerm(R.fit, t.idx).p : NaN; };
const crit = (spec, R) => (spec.type === 'gee' ? R.fit.qic : spec.type === 'lmm' ? NaN : R.fit.aic);
const coefMap = R => Object.fromEntries(R.D.cols.map((c, j) => [c.label, R.fit.beta[j]]).filter(([k]) => k !== '(Intercepto)'));
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));

export function purposeful(spec, ds, meta, rows, { pEnter = 0.25, pStay = 0.10, delta = 0.20, pNonCand = 0.15 } = {}) {
  const log = [], fit = covs => fitModel(spec, ds, meta, termsOf({ ...spec, inter: [] }, covs), rows);
  // paso 1: análisis bivariado
  const uni = spec.covs.map(v => ({ v, p: termP(fitModel(spec, ds, meta, [{ vars: [v] }], rows), v) }));
  const cand = uni.filter(u => u.p < pEnter).map(u => u.v), nonCand = uni.filter(u => !(u.p < pEnter)).map(u => u.v);
  log.push({ step: 1, text: `Análisis bivariado: candidatas con p < ${pEnter}: ${cand.join(', ') || 'ninguna'}. No candidatas: ${nonCand.join(', ') || 'ninguna'}.`, table: uni.map(u => [u.v, fp(u.p), u.p < pEnter ? 'candidata' : '—']) });
  // paso 2: eliminación iterativa con verificación de confusión
  let cur = [...cand]; const keepConf = new Set();
  for (let guard = 0; guard < 50; guard++) {
    const R = fit(cur), ps = cur.filter(v => !keepConf.has(v)).map(v => ({ v, p: termP(R, v) })).filter(x => x.p > pStay).sort((a, b) => b.p - a.p);
    if (!ps.length) break;
    const out = ps[0].v, R2 = fit(cur.filter(v => v !== out)), b1 = coefMap(R), b2 = coefMap(R2);
    const changes = Object.keys(b2).map(k => ({ k, d: Math.abs(b2[k] - b1[k]) / Math.max(Math.abs(b1[k]), 1e-8) })), mx = changes.sort((a, b) => b.d - a.d)[0];
    if (mx && mx.d > delta) { keepConf.add(out); log.push({ step: 2, text: `${out} (p = ${fp(ps[0].p)}) se mantiene como confusor: al retirarla cambia «${mx.k}» un ${(100 * mx.d).toFixed(0)} % (> ${100 * delta} %).` }); }
    else { cur = cur.filter(v => v !== out); log.push({ step: 2, text: `Se elimina ${out} (p = ${fp(ps[0].p)}); cambio máximo en otros coeficientes ${mx ? (100 * mx.d).toFixed(0) : 0} %.` }); }
  }
  // paso 3: reingreso de no candidatas
  for (const v of nonCand) {
    const R = fit([...cur, v]), p = termP(R, v);
    if (p < pNonCand) { cur.push(v); log.push({ step: 3, text: `Se reincorpora ${v}: p = ${fp(p)} en el modelo multivariable (< ${pNonCand}).` }); }
  }
  log.push({ step: 4, text: `Modelo preliminar de efectos principales: ${[spec.exposure, ...cur].filter(Boolean).join(', ')}. Evalúe a continuación la linealidad de las variables cuantitativas y las interacciones clínicamente plausibles.` });
  return { covs: cur, log };
}

export function backward(spec, ds, meta, rows, { by = 'aic', pOut = 0.10 } = {}) {
  const log = [], fit = covs => fitModel(spec, ds, meta, termsOf({ ...spec, inter: [] }, covs), rows);
  let cur = [...spec.covs], R = fit(cur);
  if (by === 'aic' && spec.type === 'lmm') by = 'p';
  const name = spec.type === 'gee' ? 'QIC' : 'AIC';
  log.push({ text: by === 'aic' ? `Modelo completo: ${name} = ${crit(spec, R).toFixed(2)}.` : `Modelo completo; umbral de salida p > ${pOut}.` });
  for (let guard = 0; guard < 60 && cur.length; guard++) {
    if (by === 'aic') {
      const c0 = crit(spec, R), tries = cur.map(v => { const r = fit(cur.filter(w => w !== v)); return { v, r, c: crit(spec, r) }; }).sort((a, b) => a.c - b.c);
      if (tries[0].c < c0) { cur = cur.filter(w => w !== tries[0].v); R = tries[0].r; log.push({ text: `Se elimina ${tries[0].v}: ${name} ${c0.toFixed(2)} → ${tries[0].c.toFixed(2)}.` }); }
      else break;
    } else {
      const ps = cur.map(v => ({ v, p: termP(R, v) })).sort((a, b) => b.p - a.p);
      if (ps[0].p > pOut) { cur = cur.filter(w => w !== ps[0].v); R = fit(cur); log.push({ text: `Se elimina ${ps[0].v} (p = ${fp(ps[0].p)}).` }); }
      else break;
    }
  }
  log.push({ text: `Modelo final: ${[spec.exposure, ...cur].filter(Boolean).join(', ')}.` });
  return { covs: cur, log };
}

// efecto de la exposición (primer coeficiente no referente) en la escala de la medida
function exposureEffects(spec, R) { const M = measureOf(spec); return R.D.cols.map((c, j) => ({ c, j })).filter(({ c }) => c.term === spec.exposure).map(({ c, j }) => ({ label: c.label, est: M.exp ? Math.exp(R.fit.beta[j]) : R.fit.beta[j] })); }

// cambio en el estimado al retirar cada covariable del modelo completo (Greenland; umbral 10 %)
export function changeInEstimate(spec, ds, meta, rows, threshold = 0.10) {
  const full = fitModel(spec, ds, meta, termsOf({ ...spec, inter: [] }), rows), eF = exposureEffects(spec, full), M = measureOf(spec);
  const crude = fitModel(spec, ds, meta, [{ vars: [spec.exposure] }], rows), eC = exposureEffects(spec, crude);
  const rows_ = spec.covs.map(v => {
    const R = fitModel(spec, ds, meta, termsOf({ ...spec, inter: [] }, spec.covs.filter(w => w !== v)), rows), e = exposureEffects(spec, R);
    const ch = e.map((x, k) => (M.exp ? (x.est - eF[k].est) / eF[k].est : (x.est - eF[k].est) / Math.abs(eF[k].est)));
    const mx = Math.max(...ch.map(Math.abs));
    return { v, effects: e, change: ch, max: mx, conf: mx >= threshold };
  }).sort((a, b) => b.max - a.max);
  return { full: eF, crude: eC, rows: rows_, threshold };
}

// modificación de efecto: exposición × covariable (prueba de Wald del término de interacción y efectos por estrato)
export function effectModification(spec, ds, meta, rows) {
  const M = measureOf(spec), E = spec.exposure;
  return spec.covs.map(v => {
    try {
      const R = fitModel(spec, ds, meta, termsOf({ ...spec, inter: [[E, v]] }), rows), t = R.D.terms.find(t => t.vars.length === 2);
      if (!t) return null;
      const p = waldTerm(R.fit, t.idx).p, strata = [];
      const eCols = R.D.cols.map((c, j) => ({ c, j })).filter(({ c }) => c.term === E);
      const mods = meta[v].type === 'num' ? [0.25, 0.5, 0.75].map(q => ({ label: `${v} = ${+quantile(rows.map(i => ds.cols[v][i]), q).toFixed(2)} (P${q * 100})`, val: quantile(rows.map(i => ds.cols[v][i]), q) })) : levelsOf(meta[v]).map(l => ({ label: `${v}: ${l}`, level: l }));
      for (const mo of mods) for (const { c, j } of eCols) {
        const w = { [j]: 1 };
        t.idx.forEach(k => { const ci = R.D.cols[k]; const eLev = ci.levels[0], mLev = ci.levels[1]; if (eLev !== c.levels[0]) return; if (meta[v].type === 'num') w[k] = mo.val; else if (mLev === mo.level) w[k] = 1; });
        strata.push({ stratum: mo.label, exposure: c.label, ...lincom(R.fit, w, M) });
      }
      return { v, p, strata, df: t.idx.length };
    } catch (e) { return { v, error: e.message }; }
  }).filter(Boolean);
}
