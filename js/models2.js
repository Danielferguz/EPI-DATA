// Modelos adicionales por máxima verosimilitud: conteos (binomial negativa, ceros inflados), Gamma y hurdle-Gamma,
// regresión ordinal (odds proporcionales), multinomial y multinivel binario/conteo (intercepto aleatorio, cuadratura adaptativa).
// Las derivadas son numéricas (BFGS + pulido de Newton): suficiente para los tamaños de muestra clínicos habituales.
import { symInv } from './linalg.js?v=2026.10.26-1';
import { lgamma, p2z, pchisqU, qnorm } from './dist.js?v=2026.10.26-1';
import { fitGLM, finish } from './models.js?v=2026.10.26-1';

const sum = a => { let s = 0; for (const v of a) s += v; return s; };
const dotr = (x, b, o = 0, k = x.length) => { let s = 0; for (let j = 0; j < k; j++) s += x[j] * b[o + j]; return s; };
const log1pexp = u => (u > 30 ? u : u < -30 ? Math.exp(u) : Math.log1p(Math.exp(u)));
const lae = (a, b) => (a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b)));
const clamp = (e, m = 30) => (e > m ? m : e < -m ? -m : e);
const diagGamma = x => { let r = 0; while (x < 6) { r -= 1 / x; x++; } const x2 = 1 / (x * x); return r + Math.log(x) - 0.5 / x - x2 * (1 / 12 - x2 * (1 / 120 - x2 / 252)); };
const triGamma = x => { let r = 0; while (x < 6) { r += 1 / (x * x); x++; } const x2 = 1 / (x * x); return r + 1 / x + 0.5 * x2 + x2 / x * (1 / 6 - x2 * (1 / 30 - x2 / 42)); };

// ---------------- maximizador genérico ----------------
function hessian(F, th, fv) {
  const d = th.length, h = Array.from(th, t => 1e-4 * (1 + Math.abs(t))), H = Array.from({ length: d }, () => new Float64Array(d));
  const at = (i, a, j, b) => { const t = Float64Array.from(th); t[i] += a * h[i]; if (j != null) t[j] += b * h[j]; return F(t); };
  for (let i = 0; i < d; i++) {
    H[i][i] = (at(i, 1) - 2 * fv + at(i, -1)) / (h[i] * h[i]);
    for (let j = 0; j < i; j++) H[i][j] = H[j][i] = (at(i, 1, j, 1) - at(i, 1, j, -1) - at(i, -1, j, 1) + at(i, -1, j, -1)) / (4 * h[i] * h[j]);
  }
  return H;
}
// maximiza f(θ); devuelve {th, ll, V (inversa de la información observada), conv}
export function maxLik(f, th0, { maxit = 400 } = {}) {
  const d = th0.length, F = t => { const v = -f(t); return isFinite(v) ? v : 1e300; };
  let th = Float64Array.from(th0), fv = F(th); if (fv >= 1e300) throw new Error('Valores iniciales inválidos para la verosimilitud.');
  const grad = t => { const g = new Float64Array(d); for (let j = 0; j < d; j++) { const h = 1e-5 * (1 + Math.abs(t[j])), a = Float64Array.from(t), b = Float64Array.from(t); a[j] += h; b[j] -= h; g[j] = (F(a) - F(b)) / (2 * h); } return g; };
  const eye = () => { const H = Array.from({ length: d }, () => new Float64Array(d)); for (let j = 0; j < d; j++) { const h = 1e-3 * (1 + Math.abs(th[j])), a = Float64Array.from(th), b = Float64Array.from(th); a[j] += h; b[j] -= h; const c = (F(a) - 2 * fv + F(b)) / (h * h); H[j][j] = c > 1e-8 ? 1 / c : 1; } return H; };
  let g = grad(th), H = eye(), conv = false;
  for (let it = 0; it < maxit; it++) {
    let dir = H.map(r => -dotr(r, g)), gd = dotr(dir, g);
    if (!(gd < 0)) { H = eye(); dir = H.map(r => -dotr(r, g)); gd = dotr(dir, g); if (!(gd < 0)) break; }
    let step = 1, nt, fn = Infinity;
    for (let k = 0; k < 60; k++) { nt = th.map((t, j) => t + step * dir[j]); fn = F(nt); if (fn <= fv + 1e-4 * step * gd) break; step /= 2; }
    if (!(fn <= fv)) break;
    const g2 = grad(nt), s = nt.map((t, j) => t - th[j]), y = g2.map((v, j) => v - g[j]), sy = dotr(s, y);
    if (sy > 1e-12) { // actualización BFGS de la inversa
      const Hy = H.map(r => dotr(r, y)), yHy = dotr(y, Hy), c = (1 + yHy / sy) / sy;
      for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) H[a][b] += c * s[a] * s[b] - (Hy[a] * s[b] + s[a] * Hy[b]) / sy;
    }
    const dec = -gd, df = fv - fn; th = nt; fv = fn; g = g2;
    if (dec < 1e-9 * (1 + Math.abs(fv)) && df < 1e-10 * (1 + Math.abs(fv))) { conv = true; break; }
  }
  // pulido de Newton con la hessiana numérica
  let Hn = null, Hi = null;
  for (let it = 0; it < 6; it++) {
    Hn = hessian(F, th, fv); Hi = symInv(Hn); if (!Hi) break;
    g = grad(th); const st = Hi.map(r => dotr(r, g)); if (Math.max(...st.map(Math.abs)) < 1e-8 * (1 + Math.max(...th.map(Math.abs)))) { conv = true; break; }
    let step = 1, fn = Infinity, nt;
    for (let k = 0; k < 30; k++) { nt = th.map((t, j) => t - step * st[j]); fn = F(nt); if (fn <= fv + 1e-12 * (1 + Math.abs(fv))) break; step /= 2; }
    if (!(fn <= fv + 1e-12 * (1 + Math.abs(fv)))) break; th = nt; fv = fn; conv = true;
  }
  Hn = hessian(F, th, fv); Hi = symInv(Hn);
  if (!Hi || Hi.some((r, j) => !(r[j] > 0))) throw new Error('Matriz de información singular: el modelo no es identificable con estos datos (colinealidad, categorías vacías o demasiados parámetros).');
  return { th, ll: -fv, V: Hi, conv };
}
const block = (V, idx) => idx.map(i => Float64Array.from(idx.map(j => V[i][j])));
const wrap = (th, V, o, k) => ({ beta: Float64Array.from(th.slice(o, o + k)), V: block(V, Array.from({ length: k }, (_, j) => o + j)) });

// ---------------- conteos: Poisson / binomial negativa, con o sin ceros inflados ----------------
// Z: matriz de diseño de la parte de ceros (con intercepto) o null. offset: log(persona-tiempo).
export function fitCount(X, y, { nb = false, Z = null, offset = null } = {}) {
  const n = X.length, p = X[0].length, q = Z ? Z[0].length : 0, off = offset || new Float64Array(n), lgy = Float64Array.from(y, v => lgamma(v + 1));
  const lli = (th, out) => {
    const r = nb ? 1 / Math.exp(th[p + q]) : 0;
    for (let i = 0; i < n; i++) {
      const e = clamp(dotr(X[i], th, 0, p) + off[i]), mu = Math.exp(e), yi = y[i];
      const lf = nb ? lgamma(yi + r) - lgamma(r) - lgy[i] + r * Math.log(r / (r + mu)) + yi * Math.log(mu / (r + mu)) : yi * e - mu - lgy[i];
      if (Z) { const u = dotr(Z[i], th, p, q), lp = -log1pexp(-u), l1 = -log1pexp(u); out[i] = yi === 0 ? lae(lp, l1 + lf) : l1 + lf; } else out[i] = lf;
    }
    return out;
  };
  const buf = new Float64Array(n), f = th => { lli(th, buf); return sum(buf); };
  let b0; try { b0 = fitGLM(X, y, 'poisson', { offset, ridge: 1e-6 }).beta; } catch { b0 = new Float64Array(p); }
  const th0 = [...b0, ...(Z ? Array.from({ length: q }, (_, k) => (k === 0 ? -1.5 : 0)) : [])];
  if (nb) { const mu = X.map((x, i) => Math.exp(dotr(x, b0) + off[i])); th0.push(Math.log(Math.max(0.05, sum(y.map((v, i) => ((v - mu[i]) ** 2 - mu[i]) / (mu[i] * mu[i]))) / n))); }
  let R; try { R = maxLik(f, th0); } catch (e) { throw new Error(nb ? 'No se pudo estimar la binomial negativa: los datos no muestran sobredispersión (α ≈ 0) o el modelo no es identificable. Use Poisson.' : e.message); }
  const th = R.th, c = wrap(th, R.V, 0, p), z = Z ? wrap(th, R.V, p, q) : null;
  const lnA = nb ? th[p + q] : null, alpha = nb ? Math.exp(lnA) : null, seA = nb ? alpha * Math.sqrt(R.V[p + q][p + q]) : null;
  lli(th, buf); const ll_i = Float64Array.from(buf), k = th.length;
  // medias ajustadas y ceros esperados
  const mu = new Float64Array(n), fitted = new Float64Array(n); let zeroExp = 0;
  for (let i = 0; i < n; i++) {
    mu[i] = Math.exp(clamp(dotr(X[i], th, 0, p) + off[i])); const pi = Z ? 1 / (1 + Math.exp(-dotr(Z[i], th, p, q))) : 0;
    fitted[i] = (1 - pi) * mu[i]; const p0 = nb ? Math.pow(1 + alpha * mu[i], -1 / alpha) : Math.exp(-mu[i]); zeroExp += pi + (1 - pi) * p0;
  }
  const out = finish({ model: 'count', dist: nb ? 'nb' : 'pois', zi: !!Z, ...c, df: Infinity, n, ll: R.ll, aic: -2 * R.ll + 2 * k, bic: -2 * R.ll + Math.log(n) * k, k, fitted, mu, lli: ll_i, conv: R.conv, alpha, alphaSE: seA, zeroExp, zeroObs: y.filter(v => v === 0).length });
  if (z) out.zero = finish({ ...z, df: Infinity });
  out.resid = Float64Array.from(y, (v, i) => v - fitted[i]);
  return out;
}
// prueba de Vuong (modelo con ceros inflados vs el mismo sin inflar) a partir de las log-verosimilitudes por observación
export function vuong(a, b) {
  const n = a.length, m = Float64Array.from(a, (v, i) => v - b[i]), mu = sum(m) / n, s = Math.sqrt(sum(m.map(v => (v - mu) ** 2)) / (n - 1)), z = Math.sqrt(n) * mu / s;
  return { z, p: p2z(z) / 2, favors: z > 0 };
}
// prueba de sobredispersión: LRT NB vs Poisson (mezcla 50:50 de χ²₀ y χ²₁)
export const lrtAlpha = (nbFit, poFit) => { const lr = Math.max(0, 2 * (nbFit.ll - poFit.ll)); return { lr, p: 0.5 * pchisqU(lr, 1) }; };

// ---------------- Gamma (enlace log) y hurdle-Gamma ----------------
export function fitGamma(X, y, { offset = null } = {}) {
  const n = X.length, p = X[0].length, off = offset || new Float64Array(n);
  if (y.some(v => !(v > 0))) throw new Error('El modelo Gamma requiere un desenlace estrictamente positivo (> 0).');
  let beta = null, eta = Float64Array.from(y, (v, i) => Math.log(v)), dev = Infinity, XtXi = null;
  for (let it = 0; it < 100; it++) {
    const mu = eta.map(e => Math.exp(clamp(e))), z = eta.map((e, i) => e - off[i] + (y[i] - mu[i]) / mu[i]);
    const XtX = Array.from({ length: p }, () => new Float64Array(p)), Xz = new Float64Array(p);
    for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) { Xz[a] += X[i][a] * z[i]; for (let b = 0; b <= a; b++) XtX[a][b] += X[i][a] * X[i][b]; }
    for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) XtX[a][b] = XtX[b][a];
    XtXi = symInv(XtX); if (!XtXi) throw new Error('Matriz de diseño singular (colinealidad o categorías vacías).');
    beta = XtXi.map(r => dotr(r, Xz)); eta = X.map((x, i) => dotr(x, beta) + off[i]);
    const nd = sum(y.map((v, i) => { const m = Math.exp(clamp(eta[i])); return 2 * (-Math.log(v / m) + (v - m) / m); }));
    if (Math.abs(nd - dev) < 1e-10 * (Math.abs(nd) + 0.1)) { dev = nd; break; } dev = nd;
  }
  const mu = eta.map(e => Math.exp(clamp(e))), pear = sum(y.map((v, i) => ((v - mu[i]) / mu[i]) ** 2)), phi = pear / (n - p);
  // forma ν = 1/φ por máxima verosimilitud (Newton)
  const s = sum(y.map((v, i) => (v - mu[i]) / mu[i] - Math.log(v / mu[i]))) / n;
  let nu = (3 - s + Math.sqrt((3 - s) ** 2 + 24 * s)) / (12 * s); for (let k = 0; k < 20; k++) { const fn = Math.log(nu) - diagGamma(nu) - s, d = 1 / nu - triGamma(nu); nu -= fn / d; if (!(nu > 0)) { nu = 1 / phi; break; } }
  const ll = sum(y.map((v, i) => -lgamma(nu) + nu * Math.log(nu * v / mu[i]) - nu * v / mu[i] - Math.log(v)));
  const V = XtXi.map(r => r.map(v => v * phi));
  return finish({ model: 'gamma', beta: Float64Array.from(beta), V, df: Infinity, n, ll, aic: -2 * ll + 2 * (p + 1), bic: -2 * ll + Math.log(n) * (p + 1), k: p + 1, phi, shape: nu, fitted: mu, resid: Float64Array.from(y, (v, i) => v - mu[i]), pres: Float64Array.from(y, (v, i) => (v - mu[i]) / mu[i]), eta });
}
// dos partes: P(Y > 0) por logística (con Z) y media de los positivos por Gamma log (con X)
export function fitHurdleGamma(X, Z, y) {
  const n = X.length;
  if (y.some(v => v < 0)) throw new Error('El desenlace no puede tener valores negativos.');
  const pos = []; y.forEach((v, i) => { if (v > 0) pos.push(i); });
  if (pos.length === n) throw new Error('No hay ceros en el desenlace: use el modelo Gamma simple.');
  if (pos.length < 10) throw new Error('Hay muy pocos valores positivos para ajustar la parte Gamma.');
  const ind = Float64Array.from(y, v => (v > 0 ? 1 : 0)), lg = fitGLM(Z, ind, 'binomial'), g = fitGamma(pos.map(i => X[i]), Float64Array.from(pos, i => y[i]));
  const ll = lg.ll + g.ll, k = lg.beta.length + g.k;
  const out = { ...g, model: 'hgamma', n, nPos: pos.length, ll, aic: -2 * ll + 2 * k, bic: -2 * ll + Math.log(n) * k, k, llGamma: g.ll, llLogit: lg.ll, fittedPos: g.fitted };
  out.zero = finish({ beta: lg.beta, V: lg.V, df: Infinity }); out.fitted = Float64Array.from(X, (x, i) => 0);
  return out;
}

// ---------------- regresión ordinal (odds proporcionales, enlace logit) ----------------
// yc: códigos 0..K-1 (en orden creciente). beta[0] = primer umbral (ocupa la columna del intercepto); beta[1..] = coeficientes
export function fitOrdinal(X, yc, K) {
  const n = X.length, p = X[0].length, kb = p - 1, nt = K - 1;
  if (K < 3) throw new Error('La regresión ordinal necesita al menos 3 categorías ordenadas.');
  const cnt = new Float64Array(K); yc.forEach(c => cnt[c]++); if (cnt.some(c => c === 0)) throw new Error('Alguna categoría del desenlace está vacía en las filas del análisis.');
  const kap = th => { const k = [th[0]]; for (let j = 1; j < nt; j++) k.push(k[j - 1] + Math.exp(th[j])); return k; };
  const sig = u => 1 / (1 + Math.exp(-u));
  const f = th => {
    const k = kap(th); let s = 0;
    for (let i = 0; i < n; i++) {
      let eta = 0; for (let j = 1; j < p; j++) eta += X[i][j] * th[nt + j - 1];
      const c = yc[i], hi = c === K - 1 ? 1 : sig(k[c] - eta), lo = c === 0 ? 0 : sig(k[c - 1] - eta), pr = hi - lo; s += Math.log(Math.max(pr, 1e-300));
    }
    return s;
  };
  // inicio: umbrales de los logits acumulados marginales
  const th0 = []; let acc = 0, prev = -Infinity;
  for (let c = 0; c < nt; c++) { acc += cnt[c] / n; const kk = Math.log(acc / (1 - acc)); th0.push(c === 0 ? kk : Math.log(Math.max(kk - prev, 0.1))); prev = kk; }
  for (let j = 0; j < kb; j++) th0.push(0);
  const R = maxLik(f, th0), th = R.th, k = kap(th);
  // delta: (κ1.., β) a partir de (θ1, logΔ.., β)
  const dd = th.length, J = Array.from({ length: dd }, () => new Float64Array(dd));
  for (let c = 0; c < nt; c++) { J[c][0] = 1; for (let j = 1; j <= c; j++) J[c][j] = Math.exp(th[j]); }
  for (let j = 0; j < kb; j++) J[nt + j][nt + j] = 1;
  const JV = J.map(r => Array.from({ length: dd }, (_, c) => { let s = 0; for (let a = 0; a < dd; a++) s += r[a] * R.V[a][c]; return s; })), Vf = J.map((_, a) => Array.from({ length: dd }, (_, b) => { let s = 0; for (let c = 0; c < dd; c++) s += JV[a][c] * J[b][c]; return s; }));
  const idx = [0, ...Array.from({ length: kb }, (_, j) => nt + j)];
  const beta = Float64Array.from([k[0], ...th.slice(nt)]), V = block(Vf, idx);
  const ll0 = sum(Array.from(cnt, c => c * Math.log(c / n))), kpar = dd;
  return finish({ model: 'ordinal', beta, V, df: Infinity, n, K, ll: R.ll, ll0, aic: -2 * R.ll + 2 * kpar, bic: -2 * R.ll + Math.log(n) * kpar, k: kpar, thresholds: k, thresholdSE: k.map((_, c) => Math.sqrt(Vf[c][c])), conv: R.conv, counts: cnt, fullV: Vf });
}
// coeficientes de los K-1 modelos logísticos binarios (y > c): comprobación informal de odds proporcionales
export function ordinalCutpoints(X, yc, K) {
  const out = [];
  for (let c = 0; c < K - 1; c++) {
    const yb = Float64Array.from(yc, v => (v > c ? 1 : 0)); try { const g = fitGLM(X, yb, 'binomial'); out.push({ cut: c, beta: g.beta, se: g.se }); } catch { out.push({ cut: c, beta: null, se: null }); }
  }
  return out;
}

// ---------------- regresión logística multinomial ----------------
// yc: códigos 0..K-1, la categoría 0 es la referencia. Devuelve el ajuste de la categoría `focus` (1..K-1) y todas en .cats
export function fitMultinomial(X, yc, K, focus = 1) {
  const n = X.length, p = X[0].length, nb = K - 1, cnt = new Float64Array(K); yc.forEach(c => cnt[c]++);
  if (cnt.some(c => c === 0)) throw new Error('Alguna categoría del desenlace está vacía en las filas del análisis.');
  const f = th => {
    let s = 0; const u = new Float64Array(K);
    for (let i = 0; i < n; i++) {
      let mx = 0; for (let c = 1; c < K; c++) { u[c] = clamp(dotr(X[i], th, (c - 1) * p, p), 60); if (u[c] > mx) mx = u[c]; }
      let z = Math.exp(-mx); for (let c = 1; c < K; c++) z += Math.exp(u[c] - mx);
      s += (yc[i] === 0 ? 0 : u[yc[i]]) - mx - Math.log(z);
    }
    return s;
  };
  const th0 = new Float64Array(nb * p); for (let c = 1; c < K; c++) th0[(c - 1) * p] = Math.log(cnt[c] / cnt[0]);
  const R = maxLik(f, th0), th = R.th, kpar = th.length;
  const cats = Array.from({ length: nb }, (_, c) => finish({ ...wrap(th, R.V, c * p, p), df: Infinity, cat: c + 1 }));
  const probs = X.map(x => { const u = [0, ...cats.map(ct => dotr(x, ct.beta))], mx = Math.max(...u), e = u.map(v => Math.exp(v - mx)), z = sum(e); return e.map(v => v / z); });
  const ll0 = sum(Array.from(cnt, c => c * Math.log(c / n)));
  const sel = cats[focus - 1], out = { ...sel, model: 'multinom', n, K, ll: R.ll, ll0, aic: -2 * R.ll + 2 * kpar, bic: -2 * R.ll + Math.log(n) * kpar, k: kpar, cats, probs, counts: cnt, conv: R.conv, focus, fullV: R.V, p0: p };
  // Wald conjunto de un término sobre todas las categorías
  out.waldAll = idx => {
    const all = []; for (let c = 0; c < nb; c++) idx.forEach(j => all.push(c * p + j));
    const Vi = symInv(block(R.V, all)); if (!Vi) return { stat: NaN, df: all.length, p: NaN };
    const b = all.map(j => th[j]); let w = 0; for (let a = 0; a < b.length; a++) for (let c = 0; c < b.length; c++) w += b[a] * Vi[a][c] * b[c];
    return { stat: w, df: all.length, p: pchisqU(w, all.length) };
  };
  return out;
}

// ---------------- multinivel: logística / Poisson con intercepto aleatorio (cuadratura de Gauss-Hermite adaptativa) ----------------
export function gaussHermite(n) {
  const x = new Array(n), w = new Array(n), m = (n + 1) >> 1; let z = 0, pp = 1;
  for (let i = 0; i < m; i++) {
    z = i === 0 ? Math.sqrt(2 * n + 1) - 1.85575 * (2 * n + 1) ** (-1 / 6) : i === 1 ? z - 1.14 * n ** 0.426 / z : i === 2 ? 1.86 * z - 0.86 * x[0] : i === 3 ? 1.91 * z - 0.91 * x[1] : 2 * z - x[i - 2];
    for (let its = 0; its < 100; its++) {
      let p1 = Math.PI ** -0.25, p2 = 0, p3; for (let j = 0; j < n; j++) { p3 = p2; p2 = p1; p1 = z * Math.sqrt(2 / (j + 1)) * p2 - Math.sqrt(j / (j + 1)) * p3; }
      pp = Math.sqrt(2 * n) * p2; const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-14) break;
    }
    x[i] = z; x[n - 1 - i] = -z; w[i] = w[n - 1 - i] = 2 / (pp * pp);
  }
  return { x, w };
}
export function fitGLMM(X, y, cluster, family = 'binomial', { offset = null, Q = 15 } = {}) {
  const n = X.length, p = X[0].length, off = offset || new Float64Array(n), gh = gaussHermite(Q), groups = new Map();
  cluster.forEach((c, i) => { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(i); });
  const G = [...groups.values()], bin = family === 'binomial', lgy = Float64Array.from(y, v => (bin ? 0 : lgamma(v + 1)));
  const f = th => {
    const sg = Math.exp(th[p]), s2 = sg * sg; let tot = 0;
    for (const g of G) {
      const eta0 = g.map(i => dotr(X[i], th, 0, p) + off[i]);
      const lik = b => { let s = 0; g.forEach((i, k) => { const e = clamp(eta0[k] + b); s += bin ? y[i] * e - log1pexp(e) : y[i] * e - Math.exp(e) - lgy[i]; }); return s; };
      let b = 0; // moda de la densidad condicional del intercepto
      for (let it = 0; it < 12; it++) {
        let sc = -b / s2, h = 1 / s2;
        g.forEach((i, k) => { const e = clamp(eta0[k] + b), m = bin ? 1 / (1 + Math.exp(-e)) : Math.exp(e); sc += y[i] - m; h += bin ? m * (1 - m) : m; });
        const st = sc / h; b += Math.abs(st) > 5 ? 5 * Math.sign(st) : st; if (Math.abs(st) < 1e-9) break;
      }
      let h = 1 / s2; g.forEach((i, k) => { const e = clamp(eta0[k] + b), m = bin ? 1 / (1 + Math.exp(-e)) : Math.exp(e); h += bin ? m * (1 - m) : m; });
      const sd = 1 / Math.sqrt(h); let acc = -Infinity;
      for (let k = 0; k < Q; k++) { const bk = b + Math.SQRT2 * sd * gh.x[k], lp = lik(bk) - bk * bk / (2 * s2) - 0.5 * Math.log(2 * Math.PI * s2) + gh.x[k] * gh.x[k] + Math.log(gh.w[k] * Math.SQRT2 * sd); acc = lae(acc, lp); }
      tot += acc;
    }
    return tot;
  };
  let b0; try { b0 = fitGLM(X, y, family, { offset, ridge: 1e-6 }); } catch { throw new Error('No se pudo ajustar el modelo base.'); }
  const R = maxLik(f, [...b0.beta, Math.log(0.7)]), th = R.th, c = wrap(th, R.V, 0, p), sg = Math.exp(th[p]), tau2 = sg * sg, kpar = p + 1;
  const llInd = b0.ll, lr = Math.max(0, 2 * (R.ll - llInd));
  const fitted = Float64Array.from(X, (x, i) => { const e = dotr(x, th, 0, p) + off[i]; return bin ? 1 / (1 + Math.exp(-e)) : Math.exp(e); });
  return finish({ model: 'glmm', family, ...c, df: Infinity, n, nclust: G.length, ll: R.ll, aic: -2 * R.ll + 2 * kpar, bic: -2 * R.ll + Math.log(n) * kpar, k: kpar, tau2, sigma: sg, sigmaSE: sg * Math.sqrt(R.V[p][p]),
    icc: bin ? tau2 / (tau2 + Math.PI ** 2 / 3) : NaN, mor: Math.exp(Math.sqrt(2 * tau2) * qnorm(0.75)), lrt: lr, lrtP: 0.5 * pchisqU(lr, 1), llInd, fitted, conv: R.conv,
    sizeMin: Math.min(...G.map(g => g.length)), sizeMax: Math.max(...G.map(g => g.length)) });
}
