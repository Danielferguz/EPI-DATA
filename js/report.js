// Tabla 1 descriptiva, tablas exportables (Word/CSV) y texto de métodos.
import { isMiss, levelsOf } from './data.js?v=2026.10.16-1';
import { shapiro, chisqTest, fisher2x2, welch, anova, mannWhitney, kruskal, mean, sd, median, quantile } from './tests.js?v=2026.10.16-1';
import { TYPES } from './analysis.js?v=2026.10.16-1';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fp = p => (!isFinite(p) ? '' : p < 0.001 ? '<0.001' : p.toFixed(3));
const f = (v, d = 1) => (isFinite(v) ? v.toFixed(d) : '–');

// ---------------- Tabla 1 ----------------
export function table1(ds, meta, vars, group = null) {
  const G = group ? levelsOf(meta[group]) : [], gcol = group ? ds.cols[group] : null;
  const idxAll = Array.from({ length: ds.n }, (_, i) => i).filter(i => !group || !isMiss(gcol[i]));
  const byG = G.map(g => idxAll.filter(i => gcol[i] === g));
  const rows = [], head = ['Variable', `Total (n = ${idxAll.length})`, ...G.map((g, k) => `${g} (n = ${byG[k].length})`), ...(group ? ['Valor p', 'Prueba'] : [])];
  for (const v of vars.filter(v => v !== group)) {
    const m = meta[v], col = ds.cols[v];
    const nmiss = idxAll.filter(i => isMiss(col[i])).length;
    if (m.type === 'num') {
      const all = idxAll.map(i => col[i]).filter(isFinite), sw = shapiro(all.slice(0, 5000)), normal = sw.p >= 0.05 || (all.length > 200 && Math.abs(skew(all)) < 1);
      const desc = a => (a.length ? (normal ? `${f(mean(a))} ± ${f(sd(a))}` : `${f(median(a))} [${f(quantile(a, 0.25))}–${f(quantile(a, 0.75))}]`) : '–');
      const gs = byG.map(ix => ix.map(i => col[i]).filter(isFinite));
      let p = NaN, test = '';
      if (group && gs.filter(g => g.length > 1).length >= 2) {
        const ok = gs.filter(g => g.length > 1);
        if (normal) { if (ok.length === 2) { p = welch(ok[0], ok[1]).p; test = 't de Welch'; } else { p = anova(ok).p; test = 'ANOVA'; } }
        else if (ok.length === 2) { p = mannWhitney(ok[0], ok[1]).p; test = 'U de Mann-Whitney'; } else { p = kruskal(ok).p; test = 'Kruskal-Wallis'; }
      }
      rows.push({ cells: [`${v}, ${normal ? 'media ± DE' : 'mediana [RIC]'}`, desc(all), ...gs.map(desc), ...(group ? [fp(p), test] : [])], bold: true, nmiss });
    } else {
      const L = levelsOf(m), cnt = ix => L.map(l => ix.filter(i => col[i] === l).length);
      const tot = cnt(idxAll), gc = byG.map(cnt);
      let p = NaN, test = '';
      if (group) {
        const tab = L.map((_, a) => gc.map(g => g[a])).filter(r => r.some(x => x > 0));
        if (tab.length > 1) {
          const c = chisqTest(tab);
          if (tab.length === 2 && tab[0].length === 2 && c.minE < 5) { p = fisher2x2(tab).p; test = 'Exacta de Fisher'; } else { p = c.p; test = c.propSmall > 0.2 ? 'χ² (precaución: esperados < 5)' : 'χ² de Pearson'; }
        }
      }
      rows.push({ cells: [`${v}, n (%)`, '', ...G.map(() => ''), ...(group ? [fp(p), test] : [])], bold: true, nmiss });
      const sT = tot.reduce((a, b) => a + b, 0);
      L.forEach((l, a) => rows.push({ cells: [`   ${l}`, `${tot[a]} (${f(100 * tot[a] / sT)})`, ...gc.map(g => { const s = g.reduce((x, y) => x + y, 0); return `${g[a]} (${f(100 * g[a] / (s || 1))})`; }), ...(group ? ['', ''] : [])] }));
    }
  }
  return { head, rows, note: `Variables cuantitativas: media ± DE si la distribución es compatible con normalidad (Shapiro-Wilk p ≥ 0.05), si no mediana [RIC]. ${group ? 'Porcentajes por columna. ' : ''}Los porcentajes excluyen datos perdidos.` };
}
function skew(a) { const m = mean(a), s = sd(a); return a.reduce((t, v) => t + ((v - m) / s) ** 3, 0) / a.length; }

export const table1HTML = T => `<table class="data t1"><thead><tr>${T.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${T.rows.map(r => `<tr>${r.cells.map((c, k) => `<td${r.bold && k === 0 ? ' class="b"' : ''}>${esc(c)}${k === 0 && r.nmiss ? ` <span class="muted">(perdidos: ${r.nmiss})</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="notes">${esc(T.note)}</p>`;

// ---------------- tabla de resultados (estilo artículo) ----------------
const ci = e => (e && isFinite(e.est) ? `${f(e.est, 2)} (${f(e.lo, 2)}–${f(e.hi, 2)})` : '');
export function resultsMatrix(R, showCrude = true) {
  const M = R.M, head = ['Variable', 'n', ...(showCrude ? [`${M.measure} crudo (IC 95%)`, 'p'] : []), `${M.measure} ajustado (IC 95%)`, 'p'];
  const body = R.table.map(r => r.kind === 'head' ? { b: true, c: [r.label, '', ...(showCrude ? ['', fp(r.pCrude)] : []), '', fp(r.pAdj)] } : { c: [`   ${r.label}`, isFinite(r.n) ? r.n : '', ...(showCrude ? [r.ref ? 'Referencia' : ci(r.crude), r.ref ? '' : fp(r.crude?.p)] : []), r.ref ? 'Referencia' : ci(r.adj), r.ref ? '' : fp(r.adj?.p)] });
  return { head, body };
}
export function wordDoc(title, tablesHTML, notes = '') {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;font-size:10pt}table{border-collapse:collapse;margin:8pt 0}th,td{border-top:1px solid #000;border-bottom:1px solid #000;padding:3pt 6pt;font-size:9pt;text-align:left}th{font-weight:bold}td.b{font-weight:bold}p.n{font-size:8pt}</style></head><body><h3>${esc(title)}</h3>${tablesHTML}${notes ? `<p class="n">${esc(notes)}</p>` : ''}</body></html>`;
}
export const matrixHTML = ({ head, body }) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.c.map((c, k) => `<td${r.b ? ' class="b"' : ''}>${esc(String(c)).replace(/^ {3}/, '&nbsp;&nbsp;&nbsp;')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export const matrixCSV = ({ head, body }) => [head, ...body.map(r => r.c)].map(r => r.map(c => { const s = String(c ?? '').trim(); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');

// ---------------- texto de métodos ----------------
export function methodsText(R, ctx, lang = 'es') {
  const s = R.spec, M = R.M, es = lang === 'es', cov = s.covs.join(', ') || (es ? 'ninguna' : 'none');
  const T = {
    linear: es ? `Se estimaron modelos de regresión lineal por mínimos cuadrados ordinarios para ${s.y}, con coeficientes β e intervalos de confianza al 95% (IC 95%)${s.robust && s.robust !== 'none' ? ` y errores estándar robustos a heterocedasticidad (${s.robust})` : ''}. Se evaluaron la normalidad de los residuos (Shapiro-Wilk y gráfico Q-Q), la homocedasticidad (Breusch-Pagan), la especificación (RESET de Ramsey), la colinealidad (factor de inflación de la varianza generalizado) y las observaciones influyentes (distancia de Cook).`
      : `Linear regression models fitted by ordinary least squares were used for ${s.y}, reporting β coefficients and 95% confidence intervals (95% CI)${s.robust && s.robust !== 'none' ? ` with heteroskedasticity-robust standard errors (${s.robust})` : ''}. Residual normality (Shapiro-Wilk test and Q-Q plot), homoskedasticity (Breusch-Pagan test), specification (Ramsey RESET), collinearity (generalised variance inflation factor) and influential observations (Cook's distance) were assessed.`,
    logistic: es ? `Se estimaron modelos de regresión logística para ${s.y} (${s.y} = ${ctx.event}), con odds ratios (OR) e IC 95% de Wald. Se evaluaron la calibración (Hosmer-Lemeshow), la discriminación (área bajo la curva ROC), la linealidad del logit para variables cuantitativas (Box-Tidwell), la colinealidad (GVIF) y el número de eventos por variable.`
      : `Logistic regression models were fitted for ${s.y} (${s.y} = ${ctx.event}), reporting odds ratios (OR) with Wald 95% CI. Calibration (Hosmer-Lemeshow), discrimination (area under the ROC curve), linearity of the logit for continuous covariates (Box-Tidwell), collinearity (GVIF) and events per variable were assessed.`,
    poisson: es ? `Se estimaron ${M.long.toLowerCase()}s (${M.measure}) con IC 95% mediante regresión de Poisson con varianza robusta (estimador sándwich HC0) para ${s.y}${s.offset ? `, con log(${s.offset}) como offset` : ''}, un enfoque recomendado para desenlaces binarios frecuentes en estudios transversales y de cohortes (Zou 2004; Barros y Hirakata 2003). Se evaluaron la colinealidad (GVIF), la linealidad en la escala logarítmica (Box-Tidwell) y las observaciones influyentes.`
      : `${M.long}s (${M.measure}) with 95% CI were estimated with Poisson regression with robust (sandwich, HC0) variance for ${s.y}${s.offset ? `, with log(${s.offset}) as offset` : ''}, an approach recommended for common binary outcomes (Zou 2004; Barros & Hirakata 2003). Collinearity (GVIF), linearity on the log scale (Box-Tidwell) and influential observations were assessed.`,
    cox: es ? `El tiempo hasta ${s.status} se analizó con curvas de Kaplan-Meier (prueba de log-rank) y regresión de riesgos proporcionales de Cox (empates de Efron), con hazard ratios (HR) e IC 95%. El supuesto de riesgos proporcionales se evaluó con residuos de Schoenfeld escalados (prueba de Grambsch-Therneau con transformación Kaplan-Meier del tiempo); la discriminación con el índice C de Harrell.`
      : `Time to ${s.status} was analysed with Kaplan-Meier curves (log-rank test) and Cox proportional hazards regression (Efron ties), reporting hazard ratios (HR) with 95% CI. The proportional hazards assumption was assessed with scaled Schoenfeld residuals (Grambsch-Therneau test, Kaplan-Meier time transform); discrimination with Harrell's C index.`,
    gee: es ? `Las mediciones repetidas de ${s.y} se analizaron con ecuaciones de estimación generalizadas (GEE; familia ${s.family}, correlación de trabajo ${s.corstr}) agrupando por ${s.id}, con errores estándar robustos (sándwich). La estructura de correlación se comparó con el criterio QIC.`
      : `Repeated measurements of ${s.y} were analysed with generalised estimating equations (GEE; ${s.family} family, ${s.corstr} working correlation) clustered by ${s.id}, with robust (sandwich) standard errors. Working correlation structures were compared with QIC.`,
    lmm: es ? `Las mediciones repetidas de ${s.y} se analizaron con un modelo lineal mixto con intercepto aleatorio por ${s.id}, estimado por máxima verosimilitud restringida (REML). Se reporta el coeficiente de correlación intraclase y la prueba de razón de verosimilitud del efecto aleatorio.`
      : `Repeated measurements of ${s.y} were analysed with a linear mixed model with a random intercept for ${s.id}, estimated by restricted maximum likelihood (REML). The intraclass correlation coefficient and a likelihood ratio test for the random effect are reported.`,
  }[s.type];
  const adj = es ? `Se presentan estimaciones crudas (cada variable por separado) y ajustadas (modelo multivariable con ${s.exposure ? `${s.exposure} como exposición principal y ` : ''}${cov} como covariables${s.inter?.length ? `, e interacciones ${s.inter.map(p => p.join('×')).join(', ')}` : ''}), en la misma muestra.`
    : `Crude (one variable at a time) and adjusted estimates (multivariable model with ${s.exposure ? `${s.exposure} as main exposure and ` : ''}${cov} as covariates${s.inter?.length ? `, and ${s.inter.map(p => p.join('×')).join(', ')} interactions` : ''}) are presented, in the same sample.`;
  let miss = '';
  if (ctx.source === 'cc') miss = es ? `Se realizó un análisis de casos completos (n = ${R.n} de ${ctx.N}).` : `A complete-case analysis was performed (n = ${R.n} of ${ctx.N}).`;
  if (ctx.source === 'simple') miss = es ? `Los datos perdidos se reemplazaron por la media (cuantitativas) o la moda (categóricas); esta imputación simple subestima la variabilidad y se presenta solo como análisis de sensibilidad.` : `Missing values were replaced by the mean (continuous) or mode (categorical); this single imputation underestimates variability and is presented only as a sensitivity analysis.`;
  if (ctx.source === 'mi' && ctx.mi) miss = es ? `Los datos perdidos se exploraron con la prueba MCAR de Little${ctx.little ? ` (χ² = ${ctx.little.stat.toFixed(2)}, gl = ${ctx.little.df}, p ${ctx.little.p < 0.001 ? '< 0.001' : '= ' + ctx.little.p.toFixed(3)})` : ''} y con modelos de la probabilidad de pérdida. Bajo el supuesto de datos perdidos al azar (MAR), se realizó imputación múltiple por ecuaciones encadenadas (MICE; ${ctx.mi.m} imputaciones, ${ctx.mi.maxit} iteraciones, semilla ${ctx.mi.seed}) con emparejamiento por media predictiva para variables cuantitativas, regresión logística para binarias y regresión logística multinomial para politómicas; el modelo de imputación incluyó ${ctx.mi.vars.join(', ')}. Las estimaciones se combinaron con las reglas de Rubin (grados de libertad de Barnard-Rubin).${ctx.delta ? ' La robustez frente a datos perdidos no al azar (MNAR) se evaluó con un análisis de sensibilidad por ajuste δ (patrón-mezcla).' : ''}`
    : `Missing data were explored with Little's MCAR test${ctx.little ? ` (χ² = ${ctx.little.stat.toFixed(2)}, df = ${ctx.little.df}, p ${ctx.little.p < 0.001 ? '< 0.001' : '= ' + ctx.little.p.toFixed(3)})` : ''} and models of the probability of missingness. Under a missing-at-random (MAR) assumption, multiple imputation by chained equations was performed (MICE; ${ctx.mi.m} imputations, ${ctx.mi.maxit} iterations, seed ${ctx.mi.seed}) using predictive mean matching for continuous variables, logistic regression for binary and multinomial logistic regression for polytomous variables; the imputation model included ${ctx.mi.vars.join(', ')}. Estimates were pooled with Rubin's rules (Barnard-Rubin degrees of freedom).${ctx.delta ? ' Robustness to missing-not-at-random (MNAR) data was assessed with a δ-adjustment (pattern-mixture) sensitivity analysis.' : ''}`;
  const sel = ctx.selection ? (es ? ` La selección de covariables siguió ${ctx.selection}.` : ` Covariate selection followed ${ctx.selection}.`) : '';
  const soft = es ? 'Los análisis se realizaron con EPI-DATA (cálculos en el navegador), con un nivel de significancia de 0.05.' : 'Analyses were performed with EPI-DATA (browser-based computations) with a significance level of 0.05.';
  return [T, adj + sel, miss, soft].filter(Boolean).join(' ');
}
export { TYPES };
