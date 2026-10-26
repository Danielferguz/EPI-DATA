// Evaluación de supuestos: colinealidad (GVIF), normalidad y homocedasticidad de residuos, especificación,
// linealidad en la escala del enlace (Box-Tidwell), sobredispersión y ceros en conteos, odds proporcionales, riesgos proporcionales.
import { fitOLS, fitGLM, coxZph, waldTerm } from './models.js?v=2026.10.26-1';
import { shapiro } from './tests.js?v=2026.10.26-1';
import { logdet, sub } from './linalg.js?v=2026.10.26-1';
import { pchisqU, pfU, qnorm } from './dist.js?v=2026.10.26-1';
import { fitCount, vuong, lrtAlpha, ordinalCutpoints } from './models2.js?v=2026.10.26-1';

// GVIF por término (Fox y Monette 1992); con 1 gl equivale al VIF clásico
export function gvif(D) {
  const cols = D.cols.map((c, j) => j).filter(j => D.cols[j].term !== '(Intercept)'), n = D.X.length;
  if (D.terms.length < 2) return D.terms.map(t => ({ term: t.name, gvif: 1, df: t.idx.length, adj: 1 }));
  const mu = cols.map(j => D.X.reduce((s, x) => s + x[j], 0) / n), sdv = cols.map((j, k) => Math.sqrt(D.X.reduce((s, x) => s + (x[j] - mu[k]) ** 2, 0) / (n - 1)) || 1);
  const R = cols.map((a, ka) => Float64Array.from(cols, (b, kb) => D.X.reduce((s, x) => s + (x[a] - mu[ka]) * (x[b] - mu[kb]), 0) / (n - 1) / (sdv[ka] * sdv[kb])));
  const ldR = logdet(R);
  return D.terms.map(t => {
    const ti = t.idx.map(j => cols.indexOf(j)), oi = cols.map((_, k) => k).filter(k => !ti.includes(k));
    const g = Math.exp(logdet(sub(R, ti)) + (oi.length ? logdet(sub(R, oi)) : 0) - ldR);
    return { term: t.name, gvif: g, df: t.idx.length, adj: Math.pow(g, 1 / (2 * t.idx.length)) };
  });
}

// Breusch-Pagan studentizado (Koenker), como lmtest::bptest
export function breuschPagan(X, resid) {
  const e2 = Float64Array.from(resid, r => r * r), f = fitOLS(X, e2), n = X.length, k = X[0].length - 1;
  const stat = n * f.r2; return { stat, df: k, p: pchisqU(stat, k) };
}
// RESET de Ramsey (potencias 2 y 3 de los valores ajustados)
export function reset(X, y, fitted) {
  const f0 = fitOLS(X, y), X1 = X.map((x, i) => Float64Array.from([...x, fitted[i] ** 2, fitted[i] ** 3]));
  try { const f1 = fitOLS(X1, y), rss0 = f0.resid.reduce((a, r) => a + r * r, 0), rss1 = f1.resid.reduce((a, r) => a + r * r, 0), F = ((rss0 - rss1) / 2) / (rss1 / f1.df); return { stat: F, df: [2, f1.df], p: pfU(F, 2, f1.df) }; }
  catch { return { stat: NaN, p: NaN }; }
}
// Hosmer-Lemeshow con g grupos de riesgo
// Box-Tidwell: añade x·ln(x) para cada predictor cuantitativo positivo y prueba su coeficiente
export function boxTidwell(D, y, family, numVars) {
  return numVars.map(v => {
    const j = D.cols.findIndex(c => c.term === v && c.vars.length === 1); if (j < 0) return null;
    const xs = D.X.map(x => x[j]), shift = Math.min(...xs) <= 0 ? 1 - Math.min(...xs) : 0;
    const X1 = D.X.map(x => Float64Array.from([...x, (x[j] + shift) * Math.log(x[j] + shift)]));
    try { const f = family === 'ols' ? fitOLS(X1, y) : fitGLM(X1, y, family); const k = X1[0].length - 1; return { v, p: f.p[k], shift }; } catch { return { v, p: NaN }; }
  }).filter(Boolean);
}
// suavizado lowess (grado 1, núcleo tricúbico, sin iteraciones robustas)
export function lowess(x, y, f = 2 / 3, npts = 60) {
  const idx = Array.from(x.keys()).filter(i => isFinite(x[i]) && isFinite(y[i])).sort((a, b) => x[a] - x[b]);
  const xs = idx.map(i => x[i]), ys = idx.map(i => y[i]), n = xs.length; if (n < 5) return [];
  const r = Math.max(2, Math.ceil(f * n)), out = [], lo = xs[0], hi = xs[n - 1];
  for (let k = 0; k < npts; k++) {
    const x0 = lo + (hi - lo) * k / (npts - 1), d = xs.map(v => Math.abs(v - x0)), h = [...d].sort((a, b) => a - b)[r - 1] || 1e-12;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const u = d[i] / h; if (u >= 1) continue; const w = (1 - u ** 3) ** 3; sw += w; sx += w * xs[i]; sy += w * ys[i]; sxx += w * xs[i] ** 2; sxy += w * xs[i] * ys[i]; }
    const den = sw * sxx - sx * sx, b = Math.abs(den) > 1e-12 ? (sw * sxy - sx * sy) / den : 0, a = (sy - b * sx) / sw;
    out.push([x0, a + b * x0]);
  }
  return out;
}

// ------------- paneles de supuestos por modelo -------------
const chk = (name, ok, value, note) => ({ name, ok, value, note });
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));
const pv = p => (!isFinite(p) ? 'p = –' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

export function assumptions(spec, R) {
  const { fit, D, y } = R, out = [], n = D.X.length, k = D.X[0].length - (spec.type === 'cox' ? 0 : 1);
  const vif = gvif(D), vmax = Math.max(...vif.map(v => v.adj ** 2));
  out.push(chk('Colinealidad (GVIF^(1/(2·gl)))²', vmax < 5, vmax.toFixed(2), vmax < 5 ? 'Sin colinealidad relevante (todos < 5).' : vmax < 10 ? 'Colinealidad moderada (5–10): revise variables redundantes.' : 'Colinealidad alta (≥ 10).'));
  const extra = { vif };
  if (spec.type === 'linear') {
    const sw = shapiro(fit.resid.length > 5000 ? fit.resid.slice(0, 5000) : fit.resid), bp = breuschPagan(D.X, fit.resid), rs = reset(D.X, y, fit.fitted);
    out.push(chk('Normalidad de residuos (Shapiro-Wilk)', sw.p >= 0.05 || n > 200, `W = ${sw.W?.toFixed(3)}; ${pv(sw.p)}`, sw.p >= 0.05 ? 'Compatible con normalidad.' : n > 200 ? 'Desviación de normalidad; con n grande los IC de β son robustos (TLC). Revise el QQ.' : 'Residuos no normales: considere transformar Y o usar EE robustos/bootstrap.'));
    out.push(chk('Homocedasticidad (Breusch-Pagan)', bp.p >= 0.05, `χ² = ${bp.stat.toFixed(2)}, gl = ${bp.df}; ${pv(bp.p)}`, bp.p >= 0.05 ? 'Varianza constante.' : 'Heterocedasticidad: use errores estándar robustos (HC3).'));
    out.push(chk('Especificación / linealidad (RESET)', rs.p >= 0.05, `F = ${rs.stat?.toFixed(2)}; ${pv(rs.p)}`, rs.p >= 0.05 ? 'Sin evidencia de mala especificación.' : 'Posible no linealidad u omisión de términos: pruebe splines/polinomios o interacciones.'));
    const nc = fit.cook.filter(c => c > 4 / n).length;
    out.push(chk('Observaciones influyentes (Cook > 4/n)', nc / n < 0.05, `${nc} (${(100 * nc / n).toFixed(1)}%); máx = ${Math.max(...fit.cook).toFixed(3)}`, Math.max(...fit.cook) > 1 ? 'Hay observaciones con D de Cook > 1: revíselas.' : 'Sin observaciones con influencia extrema (D > 1).'));
    out.push(chk('Tamaño muestral (n por parámetro)', n / k >= 10, `${(n / k).toFixed(1)}`, n / k >= 10 ? '≥ 10 observaciones por parámetro.' : 'Pocas observaciones por parámetro: riesgo de sobreajuste.'));
    extra.bt = boxTidwell(D, y, 'ols', spec.numVars);
  }
  if (spec.type === 'logistic' || spec.type === 'poisson') {
    const ev = y.reduce((a, b) => a + b, 0), minEv = Math.min(ev, n - ev), epv = minEv / k;
    out.push(chk('Eventos por variable (EPV)', epv >= 10, `${epv.toFixed(1)} (${minEv} eventos, ${k} parámetros)`, epv >= 10 ? 'EPV ≥ 10.' : epv >= 5 ? 'EPV entre 5 y 10: precaución con el sobreajuste.' : 'EPV < 5: modelo sobreajustado; reduzca covariables.'));
    if (fit.sep) out.push(chk('Convergencia / separación', false, 'posible separación', 'Coeficientes muy grandes o falta de convergencia: alguna categoría tiene 0 % o 100 % de eventos. Agrupe categorías.'));
    else out.push(chk('Convergencia', true, `${fit.iter + 1} iteraciones`, 'El algoritmo convergió.'));
    const nc = fit.cook.filter(c => c > 4 / n).length;
    out.push(chk('Observaciones influyentes (Cook > 4/n)', nc / n < 0.05, `${nc} (${(100 * nc / n).toFixed(1)}%)`, 'Revise los puntos con mayor influencia.'));
    extra.bt = boxTidwell(D, y, spec.type === 'logistic' ? 'binomial' : 'poisson', spec.numVars);
    extra.bt.forEach(b => out.push(chk(`Linealidad en la escala del enlace: ${b.v} (Box-Tidwell)`, !(b.p < 0.05), `${pv(b.p)}`, b.p < 0.05 ? 'Relación no lineal: categorice o use splines.' : 'Lineal en el logaritmo.')));
    if (spec.type === 'logistic') {
      const prev = ev / n;
      if (prev > 0.1) out.push(chk('Prevalencia del desenlace', false, `${(100 * prev).toFixed(1)} %`, 'Desenlace frecuente (> 10 %): el OR sobrestima la razón de prevalencias; considere Poisson con varianza robusta.'));
    } else {
      const over = fit.fitted.filter(m => m > 1).length, isBin = y.every(v => v === 0 || v === 1);
      if (isBin) out.push(chk('Probabilidades predichas ≤ 1', over === 0, `${over} predicciones > 1`, over ? 'Algunas predicciones superan 1 (frecuente con Poisson): no afecta la RP, pero no use el modelo para predecir.' : 'Todas las predicciones son válidas.'));
      out.push(chk('Varianza robusta (sandwich HC0)', !!fit.robust, fit.robust ? 'sí' : 'no', 'La varianza robusta corrige la sobreestimación de la varianza de Poisson con desenlaces binarios (Zou 2004; Barros y Hirakata 2003).'));
      if (!isBin) { const disp = fit.pres.reduce((a, r) => a + r * r, 0) / (n - k - 1); out.push(chk('Sobredispersión (χ² de Pearson / gl)', disp < 1.5, disp.toFixed(2), disp < 1.5 ? 'Sin sobredispersión relevante.' : 'Sobredispersión: la varianza robusta la corrige; considere binomial negativa.')); }
    }
  }

  const nz = y => Array.from(y).filter(v => v === 0).length;
  if (spec.type === 'count' || spec.type === 'nb' || spec.type === 'zip' || spec.type === 'zinb') {
    const isNB = spec.type === 'nb' || spec.type === 'zinb', zi = spec.type === 'zip' || spec.type === 'zinb';
    out.push(chk('Desenlace: conteo entero ≥ 0', true, `media ${(y.reduce((a, b) => a + b, 0) / n).toFixed(2)}; varianza ${(y.reduce((a, b) => a + b * b, 0) / n - (y.reduce((a, b) => a + b, 0) / n) ** 2).toFixed(2)}`, 'En un conteo Poisson la media y la varianza son iguales; varianza ≫ media sugiere sobredispersión.'));
    const base = zi ? fitCount(D.X, y, { nb: isNB, offset: R.off }) : null;
    if (spec.type === 'count') {
      const disp = fit.pres.reduce((a, r) => a + r * r, 0) / (n - k - 1), z0 = nz(y), e0 = fit.fitted.reduce((a, m) => a + Math.exp(-m), 0), nbf = (() => { try { return fitCount(D.X, y, { nb: true, offset: R.off }); } catch { return null; } })(), lr = nbf ? lrtAlpha(nbf, fit) : { lr: 0, p: 1 };
      out.push(chk('Sobredispersión (χ² de Pearson / gl)', disp < 1.5, disp.toFixed(2), disp < 1.5 ? 'Sin sobredispersión relevante: Poisson es adecuada.' : 'Sobredispersión: los EE de Poisson son demasiado pequeños. Use binomial negativa (o EE robustos).'));
      out.push(chk('Sobredispersión (LRT: α = 0, binomial negativa vs Poisson)', lr.p >= 0.05, `χ² = ${lr.lr.toFixed(2)}; ${pv(lr.p)}; α = ${nbf ? nbf.alpha.toFixed(3) : '≈ 0'}`, lr.p >= 0.05 ? 'No hay evidencia de sobredispersión.' : 'Hay sobredispersión: prefiera binomial negativa.'));
      out.push(chk('Exceso de ceros (observados vs esperados por Poisson)', z0 <= 1.3 * e0 + 2, `${z0} observados / ${e0.toFixed(1)} esperados`, z0 <= 1.3 * e0 + 2 ? 'Los ceros observados son compatibles con el modelo.' : 'Hay más ceros de los esperados: considere un modelo con ceros inflados (ZIP/ZINB) o binomial negativa.'));
      extra.zeros = { obs: z0, exp: e0 };
    } else {
      const lrp = isNB && !zi ? lrtAlpha(fit, fitGLM(D.X, y, 'poisson', { offset: R.off })) : null;
      if (isNB) out.push(chk('Parámetro de dispersión α', fit.alpha > 0.01, `${fit.alpha.toFixed(3)} (EE ${fit.alphaSE.toFixed(3)})`, 'α → 0 equivale a Poisson; α grande indica mucha sobredispersión.'));
      if (lrp) out.push(chk('Binomial negativa vs Poisson (LRT de α)', lrp.p < 0.05, `χ² = ${lrp.lr.toFixed(2)}; ${pv(lrp.p)}`, lrp.p < 0.05 ? 'La binomial negativa ajusta mejor que Poisson.' : 'Poisson sería suficiente (más simple).'));
      out.push(chk('Ceros observados vs esperados por el modelo', Math.abs(fit.zeroObs - fit.zeroExp) <= 0.25 * fit.zeroExp + 3, `${fit.zeroObs} observados / ${fit.zeroExp.toFixed(1)} esperados`, 'Si difieren mucho, revise la especificación o la parte de ceros.'));
      if (zi) {
        const V = vuong(fit.lli, base.lli);
        out.push(chk(`Vuong: ${spec.type.toUpperCase()} vs ${isNB ? 'binomial negativa' : 'Poisson'} sin inflar`, V.z > 1.96, `z = ${V.z.toFixed(2)}; ${pv(V.p)}`, V.z > 1.96 ? 'La inflación de ceros mejora el ajuste.' : V.z < -1.96 ? 'El modelo sin inflar ajusta mejor.' : 'No concluyente: prefiera el modelo más simple.'));
        out.push(chk('Convergencia y parte de ceros identificable', fit.conv && fit.zero.se.every(s => isFinite(s) && s < 10), fit.conv ? 'convergió' : 'sin convergencia', 'EE enormes en la parte de ceros indican que no está identificada (pocos ceros estructurales o covariables redundantes); acorte las covariables de la parte de ceros.'));
        extra.zero = true;
      }
      extra.base = base;
    }
  }
  if (spec.type === 'gamma' || spec.type === 'hgamma') {
    out.push(chk('Desenlace estrictamente positivo (parte Gamma)', true, spec.type === 'hgamma' ? `${fit.nPos} positivos de ${n} (${(100 * (n - fit.nPos) / n).toFixed(1)} % ceros)` : `n = ${n}`, spec.type === 'hgamma' ? 'La parte logística modela P(Y > 0) y la parte Gamma la media entre los positivos.' : 'Gamma exige y > 0; si hay ceros use hurdle-Gamma.'));
    out.push(chk('Dispersión φ (CV de la distribución)', true, `φ = ${fit.phi.toFixed(3)}; CV ≈ ${Math.sqrt(fit.phi).toFixed(2)}`, 'Gamma supone que la desviación típica es proporcional a la media (CV constante).'));
    const rs = Array.from(fit.pres), skew = rs.reduce((a, r) => a + r ** 3, 0) / rs.length / (rs.reduce((a, r) => a + r * r, 0) / rs.length) ** 1.5;
    out.push(chk('Residuos de Pearson sin asimetría extrema', Math.abs(skew) < 2, `asimetría = ${skew.toFixed(2)}`, 'Una cola larga de residuos sugiere un enlace o una familia inadecuados (pruebe log-normal o inversa gaussiana).'));
    const eff = spec.type === 'hgamma' ? fit.nPos : n;
    out.push(chk('Tamaño muestral (n por parámetro)', eff / (k + 1) >= 10, `${(eff / (k + 1)).toFixed(1)}`, eff / (k + 1) >= 10 ? '≥ 10 observaciones por parámetro.' : 'Pocas observaciones por parámetro: riesgo de sobreajuste.'));
    if (spec.type === 'hgamma') {
      out.push(chk('Convergencia de la parte logística', fit.zero.se.every(s => isFinite(s) && s < 10), `máx. EE = ${Math.max(...fit.zero.se).toFixed(2)}`, 'EE muy grandes indican separación (una categoría sin ceros o sin positivos).'));
      extra.zero = true;
    }
  }
  if (spec.type === 'ordinal') {
    const mn = Math.min(...fit.counts);
    out.push(chk('Pacientes por categoría del desenlace', mn >= 10, fit.counts.join(' / '), mn >= 10 ? 'Todas las categorías tienen ≥ 10 pacientes.' : 'Alguna categoría tiene < 10 pacientes: agrúpela con la vecina.'));
    const cp = ordinalCutpoints(D.X, y, fit.K), pr = D.terms.map(t => t.idx.map(j => {
      const bs = cp.map(c => c.beta?.[j]), ses = cp.map(c => c.se?.[j]); if (bs.some(b => b == null)) return { t: t.name, dev: NaN };
      return { t: t.name, dev: Math.max(...bs.map((b, c) => Math.abs(b - fit.beta[j]) / ses[c])) };
    })).flat();
    const bad = pr.filter(r => r.dev > 2.5);
    out.push(chk('Odds proporcionales (OR por punto de corte)', bad.length === 0, bad.length ? `desviación en: ${[...new Set(bad.map(b => b.t))].join(', ')}` : 'coherente', bad.length ? 'El OR de esos términos cambia entre los puntos de corte: considere regresión multinomial, un modelo de odds proporcionales parciales o dicotomizar.' : 'Los OR de los K−1 modelos logísticos acumulados son parecidos al OR común. Revise la tabla de abajo.'));
    out.push(chk('Convergencia', fit.conv, fit.conv ? 'convergió' : 'sin convergencia', ''));
    extra.cut = cp;
  }
  if (spec.type === 'multinom') {
    const mn = Math.min(...fit.counts), epv = mn / k, big = fit.cats.some(c => Array.from(c.beta).some(b => Math.abs(b) > 15));
    out.push(chk('Pacientes por categoría del desenlace', mn >= 10, fit.counts.join(' / '), 'La categoría más pequeña limita la precisión de todos los contrastes.'));
    out.push(chk('Eventos por parámetro (categoría más pequeña)', epv >= 10, epv.toFixed(1), epv >= 10 ? 'EPV ≥ 10.' : 'EPV < 10: coeficientes inestables; reduzca covariables o agrupe categorías.'));
    out.push(chk('Convergencia / separación', fit.conv && !big, fit.conv && !big ? 'convergió' : 'posible separación', 'Coeficientes enormes indican celdas vacías: agrupe categorías.'));
    out.push(chk('Independencia de alternativas irrelevantes (IIA)', true, 'supuesto del modelo', 'Las razones entre dos categorías no deben depender de si existen otras categorías; es razonable si las categorías son distintas entre sí.'));
  }
  if (spec.type === 'glmm') {
    out.push(chk('Número de conglomerados', fit.nclust >= 30, `${fit.nclust} (tamaño ${fit.sizeMin}–${fit.sizeMax})`, fit.nclust >= 30 ? 'Suficiente para estimar la varianza entre conglomerados.' : 'Pocos conglomerados (< 30): σ² y los EE son poco fiables; considere efectos fijos o GEE.'));
    out.push(chk('Efecto aleatorio (LRT vs modelo sin conglomerado)', fit.lrtP < 0.05, `σ² = ${fit.tau2.toFixed(3)}${isFinite(fit.icc) ? `; CCI = ${fit.icc.toFixed(3)}` : ''}; MOR = ${fit.mor.toFixed(2)}; ${pv(fit.lrtP)}`, fit.lrtP < 0.05 ? 'Hay correlación dentro de los conglomerados: el modelo multinivel es pertinente.' : 'Variación entre conglomerados no significativa.'));
    out.push(chk('Convergencia', fit.conv, fit.conv ? 'convergió (cuadratura adaptativa de 15 puntos)' : 'sin convergencia', ''));
    if (spec.family === 'binomial') { const ev = y.reduce((a, b) => a + b, 0), m = Math.min(ev, n - ev) / k; out.push(chk('Eventos por parámetro', m >= 10, m.toFixed(1), '')); }
  }
  if (spec.type === 'cox') {
    const ev = R.status.reduce((a, b) => a + b, 0), epv = ev / k;
    out.push(chk('Eventos por variable (EPV)', epv >= 10, `${epv.toFixed(1)} (${ev} eventos)`, epv >= 10 ? 'EPV ≥ 10.' : 'EPV bajo: riesgo de sobreajuste.'));
    const z = coxZph(fit, D.X, R.time, R.status, 'km');
    const perTerm = D.terms.map(t => ({ term: t.name, ...z.term(t.idx) }));
    perTerm.forEach(t => out.push(chk(`Riesgos proporcionales: ${t.term} (Schoenfeld)`, t.p >= 0.05, `χ² = ${t.chisq.toFixed(2)}, gl = ${t.df}; ${pv(t.p)}`, t.p >= 0.05 ? 'Supuesto razonable.' : 'Violación de RP: estratifique, añada interacción con el tiempo o reporte HR por periodos.')));
    out.push(chk('Riesgos proporcionales: global', z.global.p >= 0.05, `χ² = ${z.global.chisq.toFixed(2)}, gl = ${z.global.df}; ${pv(z.global.p)}`, ''));
    extra.zph = z;
  }
  if (spec.type === 'gee') {
    out.push(chk('Número de conglomerados', fit.nclust >= 40, `${fit.nclust}`, fit.nclust >= 40 ? 'Suficiente para el EE sándwich.' : 'Pocos conglomerados (< 40): el EE sándwich subestima la varianza; interprete con cautela.'));
    out.push(chk('Correlación de trabajo', true, `${spec.corstr}; α = ${fit.alpha.toFixed(3)}`, 'Compare estructuras con el QIC (menor es mejor).'));
  }
  if (spec.type === 'lmm') {
    const sw = shapiro(fit.cond.length > 5000 ? fit.cond.slice(0, 5000) : fit.cond);
    out.push(chk('Normalidad de residuos nivel 1 (Shapiro-Wilk)', sw.p >= 0.05 || n > 200, `${pv(sw.p)}`, 'Con n grande, desviaciones leves no afectan los efectos fijos.'));
    out.push(chk('Efecto aleatorio del sujeto (LRT)', fit.lrtREp < 0.05, `CCI = ${fit.icc.toFixed(3)}; ${pv(fit.lrtREp)}`, fit.lrtREp < 0.05 ? 'Hay correlación intra-sujeto: el modelo mixto es pertinente.' : 'Variación entre sujetos no significativa.'));
    out.push(chk('Número de sujetos', fit.nclust >= 30, `${fit.nclust}`, ''));
  }
  return { checks: out, extra };
}
export { waldTerm };
