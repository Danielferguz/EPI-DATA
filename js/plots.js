// Gráficos SVG: forest crudo vs ajustado, Kaplan-Meier, residuos, QQ, ROC, calibración, Schoenfeld,
// patrones de perdidos, convergencia de MICE, observados vs imputados, punto de inflexión (δ) y perfiles longitudinales.
import { qnorm } from './dist.js?v=2026.10.16-1';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const PAL = ['#2166AC', '#D6604D', '#4D9221', '#8073AC', '#E08214', '#35978F', '#C51B7D', '#7F7F7F'];
const BLUE = '#2166AC', GREY = '#BFC5CE';
const STYLE = '<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666)}.s{font-size:11px}</style>';
const num = (v, d = 2) => (!isFinite(v) ? '–' : Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(d));
const fpv = p => (!isFinite(p) ? '' : p < 0.001 ? '<0.001' : p.toFixed(3));

export function niceTicks(lo, hi, log, n = 5) {
  if (log) {
    const cand = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 10, 20, 50, 100];
    let t = cand.filter(v => v >= lo * 0.999 && v <= hi * 1.001);
    if (t.length > 8) t = t.filter(v => [0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100].includes(v));
    if (t.length < 3) { t = []; const a = Math.log(lo), b = Math.log(hi); for (let k = 0; k <= 4; k++) t.push(+Math.exp(a + (b - a) * k / 4).toPrecision(2)); }
    return [...new Set(t)];
  }
  const span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / n))), m = span / step > 5 * n / 1.2 ? 5 : span / step > 2 * n / 1.2 ? 2 : 1, st = step * m, out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9 * span; v += st) out.push(+v.toFixed(10));
  return out;
}
const scale = (lo, hi, a, b, log) => { const f = log ? Math.log : v => v, A = f(lo), B = f(hi); return v => a + (f(v) - A) / ((B - A) || 1) * (b - a); };

// ---------------- forest crudo vs ajustado (estilo tabla) ----------------
export function forestTable({ rows, measure, exp, showCrude = true, title = '', cLabel = 'Modelo crudo', aLabel = 'Modelo ajustado' }) {
  const rowH = 20, top = title ? 46 : 28;
  const lw = Math.max(150, Math.min(300, 7.2 * Math.max(...rows.map(r => String(r.label).length + (r.kind === 'row' ? 2 : 0)), 10)));
  const nX = lw + 34, x0 = nX + 18, x1 = x0 + 300, cw = 150, pw = 58;
  const cX = x1 + 22, cpX = cX + cw, aX = showCrude ? cpX + pw + 18 : cX, apX = aX + cw, W = apX + pw + 6, n = rows.length, H = top + n * rowH + (showCrude ? 62 : 44);
  const all = rows.flatMap(r => [r.crude, r.adj]).filter(e => e && isFinite(e.lo) && isFinite(e.hi)).flatMap(e => [e.lo, e.hi]);
  let lo = Math.min(...all, exp ? 1 : 0), hi = Math.max(...all, exp ? 1 : 0);
  if (exp) { lo = Math.max(lo / 1.05, 0.01); hi = Math.min(hi * 1.05, 100); } else { const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad; }
  const sx = scale(lo, hi, x0, x1, exp), cl = v => Math.max(x0, Math.min(x1, sx(v))), ref = exp ? 1 : 0;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Forest plot">${STYLE}`;
  if (title) s += `<text x="6" y="16" class="h">${esc(title)}</text>`;
  const hy = top - 10;
  s += `<text x="6" y="${hy}" class="h">Variables</text><text x="${nX}" y="${hy}" class="h" text-anchor="end">n</text><text x="${(x0 + x1) / 2}" y="${hy}" class="h" text-anchor="middle">${esc(measure)} (IC 95%)</text>`;
  if (showCrude) s += `<text x="${cX}" y="${hy}" class="h">${esc(cLabel)}</text><text x="${cpX + pw - 4}" y="${hy}" class="h" text-anchor="end">valor p</text>`;
  s += `<text x="${aX}" y="${hy}" class="h">${esc(aLabel)}</text><text x="${apX + pw - 4}" y="${hy}" class="h" text-anchor="end">valor p</text>`;
  const yb = top + n * rowH;
  s += `<line x1="0" x2="${W}" y1="${top - 4}" y2="${top - 4}" stroke="currentColor"/><line x1="0" x2="${W}" y1="${yb + 2}" y2="${yb + 2}" stroke="currentColor"/>`;
  [nX + 8, x1 + 12, ...(showCrude ? [cpX + pw + 8] : [])].forEach(x => (s += `<line x1="${x}" x2="${x}" y1="${top - 20}" y2="${yb + 2}" stroke="currentColor" stroke-width=".6"/>`));
  s += `<line x1="${sx(ref)}" x2="${sx(ref)}" y1="${top - 4}" y2="${yb + 2}" stroke="currentColor" stroke-dasharray="4 3"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH + 13;
    if (r.kind === 'head') { s += `<text x="6" y="${y}" class="h">${esc(r.label)}</text>`; if (isFinite(r.pAdj)) s += `<text x="${apX + pw - 4}" y="${y}" text-anchor="end" class="m s">global ${fpv(r.pAdj)}</text>`; if (showCrude && isFinite(r.pCrude)) s += `<text x="${cpX + pw - 4}" y="${y}" text-anchor="end" class="m s">global ${fpv(r.pCrude)}</text>`; return; }
    s += `<text x="18" y="${y}">${esc(r.label)}</text>`;
    if (isFinite(r.n)) s += `<text x="${nX}" y="${y}" text-anchor="end">${r.n}</text>`;
    if (r.ref) {
      if (showCrude) s += `<rect x="${sx(ref) - 4}" y="${y - 12}" width="8" height="8" fill="${GREY}"/><text x="${cX}" y="${y}">Referencia</text>`;
      s += `<rect x="${sx(ref) - 4}" y="${y - 7}" width="8" height="8" fill="${BLUE}"/><text x="${aX}" y="${y}">Referencia</text>`; return;
    }
    const mark = (e, dy, col, sz) => (e && isFinite(e.est) ? `<line x1="${cl(e.lo)}" x2="${cl(e.hi)}" y1="${y - 4 + dy}" y2="${y - 4 + dy}" stroke="${col}" stroke-width="1.3"/>${e.lo < lo ? `<path d="M${x0},${y - 4 + dy} l5,-3 v6z" fill="${col}"/>` : ''}${e.hi > hi ? `<path d="M${x1},${y - 4 + dy} l-5,-3 v6z" fill="${col}"/>` : ''}<rect x="${cl(e.est) - sz / 2}" y="${y - 4 + dy - sz / 2}" width="${sz}" height="${sz}" fill="${col}"/>` : '');
    if (showCrude) s += mark(r.crude, -3, GREY, 9);
    s += mark(r.adj, showCrude ? 3 : 0, BLUE, 9);
    const txt = e => (e && isFinite(e.est) ? `${num(e.est)} (${num(e.lo)}, ${num(e.hi)})` : '–');
    if (showCrude) s += `<text x="${cX}" y="${y}">${r.inter ? '' : txt(r.crude)}</text><text x="${cpX + pw - 4}" y="${y}" text-anchor="end">${r.crude ? fpv(r.crude.p) : ''}</text>`;
    s += `<text x="${aX}" y="${y}">${txt(r.adj)}</text><text x="${apX + pw - 4}" y="${y}" text-anchor="end">${r.adj ? fpv(r.adj.p) : ''}</text>`;
  });
  // eje
  s += niceTicks(lo, hi, exp).map(v => `<line x1="${sx(v)}" x2="${sx(v)}" y1="${yb + 2}" y2="${yb + 6}" stroke="currentColor"/><text x="${sx(v)}" y="${yb + 19}" text-anchor="middle" class="s">${v}</text>`).join('');
  if (showCrude) { const ly = yb + 32, lx = (x0 + x1) / 2 - 80; s += `<rect x="${lx}" y="${ly}" width="9" height="9" fill="${BLUE}"/><text x="${lx + 14}" y="${ly + 9}" class="s">Ajustado</text><rect x="${lx + 90}" y="${ly}" width="9" height="9" fill="${GREY}"/><text x="${lx + 104}" y="${ly + 9}" class="s">Crudo</text>`; }
  return s + '</svg>';
}

// ---------------- marco genérico para gráficos x-y ----------------
function frame({ W = 560, H = 380, xdom, ydom, xlab = '', ylab = '', xlog = false, title = '', ml = 56, mb = 46 }) {
  const m = { l: ml, r: 16, t: title ? 30 : 14, b: mb }, sx = scale(xdom[0], xdom[1], m.l, W - m.r, xlog), sy = scale(ydom[0], ydom[1], H - m.b, m.t, false);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img">${STYLE}`;
  if (title) s += `<text x="8" y="18" class="h">${esc(title)}</text>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="none" stroke="currentColor" stroke-width=".7"/>`;
  niceTicks(xdom[0], xdom[1], xlog).filter(v => v >= xdom[0] - 1e-9 && v <= xdom[1] + 1e-9).forEach(v => (s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${H - m.b}" y2="${H - m.b + 4}" stroke="currentColor"/><text x="${sx(v)}" y="${H - m.b + 17}" text-anchor="middle" class="s">${+v.toPrecision(6)}</text>`));
  niceTicks(ydom[0], ydom[1], false).filter(v => v >= ydom[0] - 1e-9 && v <= ydom[1] + 1e-9).forEach(v => (s += `<line x1="${m.l - 4}" x2="${m.l}" y1="${sy(v)}" y2="${sy(v)}" stroke="currentColor"/><text x="${m.l - 7}" y="${sy(v) + 4}" text-anchor="end" class="s">${+v.toPrecision(6)}</text>`));
  s += `<text x="${(m.l + W - m.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(xlab)}</text><text transform="translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(ylab)}</text>`;
  return { s, sx, sy, m, W, H };
}
const ext = (a, pad = 0.05) => { const v = a.filter(isFinite); let lo = Math.min(...v), hi = Math.max(...v); if (lo === hi) { lo -= 1; hi += 1; } const d = (hi - lo) * pad; return [lo - d, hi + d]; };
const path = (pts, sx, sy) => pts.filter(p => isFinite(p[0]) && isFinite(p[1])).map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
const thin = (n, max = 4000) => (n > max ? Math.ceil(n / max) : 1);

export function scatterPlot({ x, y, xlab, ylab, title, hline = null, smooth = null, line = null, color = BLUE, ydom = null }) {
  const F = frame({ xdom: ext(Array.from(x)), ydom: ydom || ext([...Array.from(y), ...(hline != null ? [hline] : [])]), xlab, ylab, title }); let s = F.s; const k = thin(x.length);
  if (hline != null) s += `<line x1="${F.m.l}" x2="${F.W - F.m.r}" y1="${F.sy(hline)}" y2="${F.sy(hline)}" stroke="currentColor" stroke-dasharray="4 3"/>`;
  for (let i = 0; i < x.length; i += k) if (isFinite(x[i]) && isFinite(y[i])) s += `<circle cx="${F.sx(x[i]).toFixed(1)}" cy="${F.sy(y[i]).toFixed(1)}" r="2.4" fill="${color}" fill-opacity=".45"/>`;
  if (line) s += `<path d="${path(line, F.sx, F.sy)}" fill="none" stroke="#555" stroke-width="1.2"/>`;
  if (smooth?.length) s += `<path d="${path(smooth, F.sx, F.sy)}" fill="none" stroke="${PAL[1]}" stroke-width="2"/>`;
  return s + '</svg>';
}
export function qqPlot(r, title = 'Q-Q normal de residuos estandarizados') {
  const v = Float64Array.from(r).filter(isFinite).sort(), n = v.length, th = Array.from(v, (_, i) => qnorm((i + 0.5) / n));
  const lim = ext([...th, ...v]);
  return scatterPlot({ x: th, y: v, xlab: 'Cuantiles teóricos', ylab: 'Cuantiles observados', title, line: [[lim[0], lim[0]], [lim[1], lim[1]]], ydom: lim });
}
export function histPlot(v, { xlab = '', title = '', bins = 0, normal = true } = {}) {
  v = Array.from(v).filter(isFinite); const n = v.length; bins = bins || Math.min(40, Math.max(8, Math.ceil(Math.log2(n) + 1) * 2));
  const [lo, hi] = ext(v, 0.001), w = (hi - lo) / bins, cnt = new Array(bins).fill(0); v.forEach(x => cnt[Math.min(bins - 1, Math.floor((x - lo) / w))]++);
  const dens = cnt.map(c => c / (n * w)), m = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const nd = x => Math.exp(-((x - m) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI)), ymax = Math.max(...dens, nd(m)) * 1.08;
  const F = frame({ xdom: [lo, hi], ydom: [0, ymax], xlab, ylab: 'Densidad', title }); let s = F.s;
  dens.forEach((d, k) => (s += `<rect x="${F.sx(lo + k * w)}" y="${F.sy(d)}" width="${Math.max(0, F.sx(lo + (k + 1) * w) - F.sx(lo + k * w) - 1)}" height="${F.sy(0) - F.sy(d)}" fill="${BLUE}" fill-opacity=".55"/>`));
  if (normal) s += `<path d="${path(Array.from({ length: 80 }, (_, k) => { const x = lo + (hi - lo) * k / 79; return [x, nd(x)]; }), F.sx, F.sy)}" fill="none" stroke="${PAL[1]}" stroke-width="2"/>`;
  return s + '</svg>';
}
export function cookPlot(cook, title = 'Distancia de Cook') {
  const n = cook.length, F = frame({ xdom: [0, n + 1], ydom: [0, Math.max(...cook, 4 / n) * 1.1], xlab: 'Observación', ylab: 'D de Cook', title }); let s = F.s;
  s += `<line x1="${F.m.l}" x2="${F.W - F.m.r}" y1="${F.sy(4 / n)}" y2="${F.sy(4 / n)}" stroke="${PAL[1]}" stroke-dasharray="4 3"/><text x="${F.W - F.m.r - 4}" y="${F.sy(4 / n) - 4}" text-anchor="end" class="s m">4/n</text>`;
  const k = thin(n, 3000); for (let i = 0; i < n; i += k) s += `<line x1="${F.sx(i + 1)}" x2="${F.sx(i + 1)}" y1="${F.sy(0)}" y2="${F.sy(cook[i])}" stroke="${cook[i] > 4 / n ? PAL[1] : BLUE}"/>`;
  return s + '</svg>';
}
export function rocPlot(pts, aucTxt) {
  const F = frame({ W: 420, H: 400, xdom: [0, 1], ydom: [0, 1], xlab: '1 − Especificidad', ylab: 'Sensibilidad', title: `Curva ROC (${aucTxt})` }); let s = F.s;
  s += `<line x1="${F.sx(0)}" y1="${F.sy(0)}" x2="${F.sx(1)}" y2="${F.sy(1)}" stroke="currentColor" stroke-dasharray="4 3"/>`;
  return s + `<path d="${path(pts, F.sx, F.sy)}" fill="none" stroke="${BLUE}" stroke-width="2"/></svg>`;
}
export function calibPlot(hl) {
  const mx = Math.max(...hl.rows.flatMap(r => [r.pobs, r.pexp]), 0.05) * 1.05, F = frame({ W: 420, H: 400, xdom: [0, mx], ydom: [0, mx], xlab: 'Probabilidad predicha', ylab: 'Proporción observada', title: 'Calibración por deciles de riesgo' }); let s = F.s;
  s += `<line x1="${F.sx(0)}" y1="${F.sy(0)}" x2="${F.sx(mx)}" y2="${F.sy(mx)}" stroke="currentColor" stroke-dasharray="4 3"/>`;
  hl.rows.forEach(r => (s += `<circle cx="${F.sx(r.pexp)}" cy="${F.sy(r.pobs)}" r="4.5" fill="${BLUE}"/>`));
  return s + `<path d="${path(hl.rows.map(r => [r.pexp, r.pobs]), F.sx, F.sy)}" fill="none" stroke="${BLUE}"/></svg>`;
}
export function schoenfeldPlot(z, j, label, smooth) {
  const y = z.scaled.map(r => r[j]), x = z.times;
  return scatterPlot({ x, y, xlab: 'Tiempo', ylab: `β(t) de ${label}`, title: `Residuos de Schoenfeld escalados: ${label}`, smooth, hline: null });
}

// ---------------- Kaplan-Meier con tabla de riesgo ----------------
export function kmPlot(curves, { xlab = 'Tiempo', title = 'Curvas de Kaplan-Meier', ci = true, pTxt = '', risk = true } = {}) {
  const tmax = Math.max(...curves.flatMap(c => c.k.steps.map(s => s.t))), W = 640, nR = risk ? curves.length : 0, H = 380 + (risk ? 26 + 18 * nR : 0);
  const F = frame({ W, H, xdom: [0, tmax], ydom: [0, 1], xlab, ylab: 'Probabilidad de supervivencia', title, ml: 120, mb: 46 + (risk ? 26 + 18 * nR : 0) }); let s = F.s;
  curves.forEach((c, g) => {
    const col = PAL[g % PAL.length], st = [{ t: 0, surv: 1, lo: 1, hi: 1 }, ...c.k.steps], line = [], lo = [], hi = [];
    st.forEach((p, i) => { if (i) { line.push([p.t, st[i - 1].surv]); lo.push([p.t, st[i - 1].lo]); hi.push([p.t, st[i - 1].hi]); } line.push([p.t, p.surv]); lo.push([p.t, p.lo]); hi.push([p.t, p.hi]); });
    if (ci) s += `<path d="${path(hi, F.sx, F.sy)}L${[...lo].reverse().map(p => `${F.sx(p[0]).toFixed(1)},${F.sy(p[1]).toFixed(1)}`).join('L')}Z" fill="${col}" fill-opacity=".12" stroke="none"/>`;
    s += `<path d="${path(line, F.sx, F.sy)}" fill="none" stroke="${col}" stroke-width="2"/>`;
    c.k.steps.filter(p => p.ncens > 0).forEach(p => (s += `<line x1="${F.sx(p.t)}" x2="${F.sx(p.t)}" y1="${F.sy(p.surv) - 4}" y2="${F.sy(p.surv) + 4}" stroke="${col}"/>`));
    s += `<rect x="${F.W - 190}" y="${F.m.t + 8 + g * 17}" width="10" height="10" fill="${col}"/><text x="${F.W - 175}" y="${F.m.t + 17 + g * 17}" class="s">${esc(c.label)}</text>`;
  });
  if (pTxt) s += `<text x="${F.m.l + 10}" y="${F.H - F.m.b - 10}" class="s">${esc(pTxt)}</text>`;
  if (risk) {
    const y0 = H - 18 * nR - 12, ticks = niceTicks(0, tmax, false).filter(v => v <= tmax);
    s += `<text x="8" y="${y0 - 10}" class="h s">Número en riesgo</text>`;
    curves.forEach((c, g) => {
      s += `<text x="8" y="${y0 + 8 + g * 18}" class="s" fill="${PAL[g % PAL.length]}">${esc(String(c.label).slice(0, 16))}</text>`;
      ticks.forEach(t => { const nr = c.k.steps.find(p => p.t >= t)?.nrisk ?? 0; s += `<text x="${F.sx(t)}" y="${y0 + 8 + g * 18}" text-anchor="middle" class="s">${nr}</text>`; });
    });
  }
  return s + '</svg>';
}

// ---------------- datos perdidos ----------------
export function missBarPlot(sum) {
  const rowH = 20, lw = Math.min(220, 7 * Math.max(...sum.map(s => s.v.length), 8)), W = lw + 360, H = 30 + sum.length * rowH + 30, x0 = lw + 10, x1 = W - 70;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img">${STYLE}<text x="8" y="16" class="h">Porcentaje de datos perdidos por variable</text>`;
  const mx = Math.max(0.05, ...sum.map(x => x.pct));
  sum.forEach((x, i) => { const y = 28 + i * rowH; s += `<text x="${lw}" y="${y + 13}" text-anchor="end">${esc(x.v)}</text><rect x="${x0}" y="${y + 3}" width="${(x1 - x0) * x.pct / mx}" height="${rowH - 6}" fill="${x.pct > 0.2 ? PAL[1] : x.pct > 0.05 ? PAL[4] : BLUE}"/><text x="${x0 + (x1 - x0) * x.pct / mx + 5}" y="${y + 14}" class="s">${(100 * x.pct).toFixed(1)}% (${x.miss})</text>`; });
  return s + '</svg>';
}
export function patternPlot(pats, vars, maxRows = 30) {
  const P = pats.slice(0, maxRows), cw = Math.max(26, Math.min(60, 640 / vars.length)), lw = 60, top = 120, rh = 18, W = lw + vars.length * cw + 70, H = top + P.length * rh + 16;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img">${STYLE}<text x="8" y="16" class="h">Patrones de datos perdidos</text>`;
  vars.forEach((v, j) => (s += `<text transform="translate(${lw + j * cw + cw / 2 + 4} ${top - 6}) rotate(-55)" class="s">${esc(v.slice(0, 18))}</text>`));
  s += `<text x="${lw - 6}" y="${top - 6}" text-anchor="end" class="s h">n</text><text x="${lw + vars.length * cw + 6}" y="${top - 6}" class="s h">n.º perd.</text>`;
  P.forEach((p, i) => { const y = top + i * rh; s += `<text x="${lw - 6}" y="${y + 13}" text-anchor="end" class="s">${p.n}</text>`; p.obs.forEach((o, j) => (s += `<rect x="${lw + j * cw}" y="${y}" width="${cw - 1}" height="${rh - 1}" fill="${o ? '#7FA7D3' : '#D6604D'}"/>`)); s += `<text x="${lw + vars.length * cw + 6}" y="${y + 13}" class="s">${p.nmiss}</text>`; });
  return s + `<text x="8" y="${H - 2}" class="s m">${pats.length > maxRows ? `Se muestran ${maxRows} de ${pats.length} patrones. ` : ''}Azul = observado · rojo = perdido</text></svg>`;
}
export function tracePlot(trace, v, isNum) {
  const chains = trace[v], it = chains[0].length, all = chains.flat();
  const F = frame({ W: 440, H: 260, xdom: [1, Math.max(2, it)], ydom: ext(all, 0.15), xlab: 'Iteración', ylab: isNum ? 'Media imputada' : 'Proporción imputada (no ref.)', title: v }); let s = F.s;
  chains.forEach((c, k) => (s += `<path d="${path(c.map((y, i) => [i + 1, y]), F.sx, F.sy)}" fill="none" stroke="${PAL[k % PAL.length]}" stroke-opacity=".8"/>`));
  return s + '</svg>';
}
export function stripPlot(obs, impByM, v) {
  const m = impByM.length, F = frame({ W: 520, H: 300, xdom: [-0.5, m + 0.5], ydom: ext([...obs, ...impByM.flat()]), xlab: 'Imputación (0 = observados)', ylab: v, title: `Observados vs imputados: ${v}` }); let s = F.s;
  const R = (i => () => ((i = (i * 9301 + 49297) % 233280) / 233280 - 0.5))(7);
  const k = thin(obs.length, 1500);
  for (let i = 0; i < obs.length; i += k) s += `<circle cx="${F.sx(R() * 0.5)}" cy="${F.sy(obs[i])}" r="2" fill="${BLUE}" fill-opacity=".35"/>`;
  impByM.forEach((arr, j) => arr.forEach(y => (s += `<circle cx="${F.sx(j + 1 + R() * 0.5)}" cy="${F.sy(y)}" r="2.3" fill="${PAL[1]}" fill-opacity=".6"/>`)));
  return s + '</svg>';
}
export function catImpPlot(obsProp, impProps, v) {
  // proporción del nivel no referente: observados vs cada imputación
  const m = impProps.length, F = frame({ W: 520, H: 260, xdom: [-0.7, m + 0.7], ydom: [0, Math.min(1, Math.max(obsProp, ...impProps) * 1.25 + 0.02)], xlab: 'Imputación (0 = observados)', ylab: 'Proporción (no ref.)', title: `Observados vs imputados: ${v}` }); let s = F.s;
  [obsProp, ...impProps].forEach((p, j) => (s += `<rect x="${F.sx(j) - 6}" y="${F.sy(p)}" width="12" height="${F.sy(0) - F.sy(p)}" fill="${j ? PAL[1] : BLUE}" fill-opacity=".75"/>`));
  return s + '</svg>';
}
export function tippingPlot(pts, { xlab, measure, exp }) {
  const ys = pts.flatMap(p => [p.lo, p.hi]), ref = exp ? 1 : 0, F = frame({ W: 560, H: 340, xdom: ext(pts.map(p => p.delta), 0.08), ydom: ext([...ys, ref], 0.08), xlab, ylab: `${measure} (IC 95%)`, title: 'Análisis de sensibilidad MNAR (ajuste δ)' }); let s = F.s;
  s += `<line x1="${F.m.l}" x2="${F.W - F.m.r}" y1="${F.sy(ref)}" y2="${F.sy(ref)}" stroke="currentColor" stroke-dasharray="4 3"/>`;
  s += `<path d="${path(pts.map(p => [p.delta, p.hi]), F.sx, F.sy)}L${[...pts].reverse().map(p => `${F.sx(p.delta).toFixed(1)},${F.sy(p.lo).toFixed(1)}`).join('L')}Z" fill="${BLUE}" fill-opacity=".15"/>`;
  s += `<path d="${path(pts.map(p => [p.delta, p.est]), F.sx, F.sy)}" fill="none" stroke="${BLUE}" stroke-width="2"/>`;
  pts.forEach(p => (s += `<circle cx="${F.sx(p.delta)}" cy="${F.sy(p.est)}" r="3.5" fill="${p.p < 0.05 ? BLUE : '#fff'}" stroke="${BLUE}"/>`));
  return s + '</svg>';
}

// ---------------- longitudinal ----------------
export function profilePlot(groups, { xlab = 'Tiempo', ylab = '', title = 'Perfil medio (IC 95%)' }) {
  const xs = groups.flatMap(g => g.pts.map(p => p.x)), ys = groups.flatMap(g => g.pts.flatMap(p => [p.lo, p.hi]));
  const F = frame({ W: 600, H: 360, xdom: ext(xs, 0.06), ydom: ext(ys, 0.08), xlab, ylab, title }); let s = F.s;
  groups.forEach((g, k) => {
    const col = PAL[k % PAL.length], off = (k - (groups.length - 1) / 2) * (F.sx(xs[1] ?? 1) - F.sx(xs[0] ?? 0)) * 0;
    g.pts.forEach(p => (s += `<line x1="${F.sx(p.x) + off}" x2="${F.sx(p.x) + off}" y1="${F.sy(p.lo)}" y2="${F.sy(p.hi)}" stroke="${col}"/>`));
    s += `<path d="${path(g.pts.map(p => [p.x, p.m]), F.sx, F.sy)}" fill="none" stroke="${col}" stroke-width="2"/>`;
    g.pts.forEach(p => (s += `<circle cx="${F.sx(p.x)}" cy="${F.sy(p.m)}" r="3.5" fill="${col}"/>`));
    s += `<rect x="${F.W - 170}" y="${F.m.t + 8 + k * 17}" width="10" height="10" fill="${col}"/><text x="${F.W - 155}" y="${F.m.t + 17 + k * 17}" class="s">${esc(g.label)}</text>`;
  });
  return s + '</svg>';
}
export function spaghettiPlot(lines, { xlab, ylab }) {
  const xs = lines.flatMap(l => l.pts.map(p => p[0])), ys = lines.flatMap(l => l.pts.map(p => p[1]));
  const F = frame({ W: 600, H: 360, xdom: ext(xs, 0.04), ydom: ext(ys, 0.05), xlab, ylab, title: 'Trayectorias individuales' }); let s = F.s;
  const groups = [...new Set(lines.map(l => l.g))];
  lines.slice(0, 400).forEach(l => (s += `<path d="${path(l.pts, F.sx, F.sy)}" fill="none" stroke="${PAL[groups.indexOf(l.g) % PAL.length]}" stroke-opacity=".35"/>`));
  return s + '</svg>';
}
