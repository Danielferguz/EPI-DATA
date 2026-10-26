// Validación de models2.js frente a statsmodels (tests/reference2.json, generado con tools/make_reference2.py).
import { readFileSync } from 'node:fs';
import { parseCSV } from '../js/io.js';
import { inferMeta, typedData, design, response } from '../js/data.js';
import { fitGLM } from '../js/models.js';
import { fitCount, fitGamma, fitHurdleGamma, fitOrdinal, fitMultinomial, fitGLMM, vuong } from '../js/models2.js';

const here = new URL('.', import.meta.url);
const ref = JSON.parse(readFileSync(new URL('reference2.json', here)));
const rows = parseCSV(readFileSync(new URL('sim2.csv', here), 'utf8'));
const meta = inferMeta(rows); meta.z.type = 'num'; ['x1', 'ygam'].forEach(v => (meta[v].type = 'num'));
const ds = typedData(rows, meta), all = [...Array(ds.n).keys()];
const D = design(ds, meta, [{ vars: ['x1'] }, { vars: ['z'] }, { vars: ['g'] }], all), X = D.X;
let fails = 0;
const close = (name, a, b, tol = 1e-3) => {
  const A = (ArrayBuffer.isView(a) ? Array.from(a) : [].concat(a)).map(Number), B = [].concat(b);
  const ok = A.length === B.length && A.every((v, i) => Math.abs(v - B[i]) <= tol * Math.max(1, Math.abs(B[i])));
  if (!ok) { fails++; console.log('FAIL', name, A, B); } else console.log('ok  ', name);
};
const col = v => response(ds, meta[v], all);
const t0 = Date.now(), lap = s => console.log(`   (${s}: ${Date.now() - t0} ms)`);
let f = fitGLM(X, col('ypois'), 'poisson'); close('Poisson ll', f.ll, ref.pois.ll, 1e-6);
f = fitCount(X, col('ynb'), { nb: true }); close('NB beta', f.beta, ref.nb.beta); close('NB se', f.se, ref.nb.se); close('NB alpha', f.alpha, ref.nb.alpha); close('NB se(alpha)', f.alphaSE, ref.nb.seAlpha, 5e-3); close('NB ll', f.ll, ref.nb.ll, 1e-6); lap('nb');
f = fitCount(X, col('yzip'), { Z: X }); close('ZIP beta', f.beta, ref.zip.beta); close('ZIP se', f.se, ref.zip.se, 5e-3); close('ZIP cero beta', f.zero.beta, ref.zip.zero); close('ZIP cero se', f.zero.se, ref.zip.zeroSE, 5e-3); close('ZIP ll', f.ll, ref.zip.ll, 1e-6); lap('zip');
const po = fitCount(X, col('yzip'), {}); const v = vuong(f.lli, po.lli); console.log('   Vuong ZIP vs Poisson z=', v.z.toFixed(2));
f = fitCount(X, col('yzinb'), { nb: true, Z: X }); close('ZINB beta', f.beta, ref.zinb.beta, 5e-3); close('ZINB se', f.se, ref.zinb.se, 1e-2); close('ZINB alpha', f.alpha, ref.zinb.alpha, 5e-3); close('ZINB ll', f.ll, ref.zinb.ll, 1e-6); lap('zinb');
const pos = all.filter(i => ds.cols.ygam[i] > 0), Xp = pos.map(i => X[i]);
f = fitGamma(Xp, Float64Array.from(pos, i => ds.cols.ygam[i])); close('Gamma beta', f.beta, ref.gamma.beta, 1e-6); close('Gamma se', f.se, ref.gamma.se, 1e-6);
const h = fitHurdleGamma(X, X, col('ygam')); close('Hurdle: parte Gamma', h.beta, ref.gamma.beta, 1e-6); console.log('   hurdle zero beta', Array.from(h.zero.beta).map(x => x.toFixed(3)).join(' '));
const yo = Int32Array.from(ds.cols.yord, c => +c - 1);
f = fitOrdinal(X, yo, 4); close('Ordinal beta', Array.from(f.beta).slice(1), ref.ord.beta); close('Ordinal se', Array.from(f.se).slice(1), ref.ord.se, 5e-3); close('Ordinal ll', f.ll, ref.ord.ll, 1e-6); close('Ordinal umbral 1', f.thresholds[0], ref.ord.thr1); lap('ord');
const cats = ['ref', 'b', 'c'], ym = Int32Array.from(ds.cols.ymn, c => cats.indexOf(c));
f = fitMultinomial(X, ym, 3, 1); close('Multinomial b', f.cats[0].beta, ref.mn.b); close('Multinomial c', f.cats[1].beta, ref.mn.c); close('Multinomial se b', f.cats[0].se, ref.mn.seb, 5e-3); close('Multinomial ll', f.ll, ref.mn.ll, 1e-6); lap('mn');
const X3 = design(ds, meta, [{ vars: ['x1'] }, { vars: ['z'] }], all).X, cl = Array.from(ds.cols.cl);
for (const [fam, key, yv] of [['binomial', 'glmmb', 'ycb'], ['poisson', 'glmmp', 'ycp']]) {
  f = fitGLMM(X3, col(yv), cl, fam); close(`GLMM ${fam} beta`, f.beta, ref[key].beta, 2e-3); close(`GLMM ${fam} sigma`, f.sigma, ref[key].sigma, 5e-3); close(`GLMM ${fam} se`, f.se, ref[key].se, 1e-2); close(`GLMM ${fam} ll`, f.ll, ref[key].ll, 1e-5); lap(fam);
}
console.log(fails ? `${fails} FALLOS` : 'Todo correcto'); process.exit(fails ? 1 : 0);
