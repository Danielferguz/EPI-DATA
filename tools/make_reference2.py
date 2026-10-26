# Referencias (statsmodels / scipy) para los modelos de models2.js → tests/sim2.csv y tests/reference2.json
import json, numpy as np, pandas as pd, statsmodels.api as sm
from scipy import optimize, special
from statsmodels.miscmodels.ordinal_model import OrderedModel
from statsmodels.tools.numdiff import approx_hess
rng = np.random.default_rng(11)
n = 700
d = pd.DataFrame({'x1': rng.normal(0, 1, n), 'z': rng.binomial(1, .45, n), 'g': rng.choice(['A', 'B', 'C'], n)})
gB, gC = (d.g == 'B').astype(float), (d.g == 'C').astype(float)
eta = .3 + .35 * d.x1 + .4 * d.z - .3 * gB
mu = np.exp(eta)
d['ypois'] = rng.poisson(mu)
th = 1 / .6
d['ynb'] = rng.negative_binomial(th, th / (th + mu))
pz = 1 / (1 + np.exp(-(-.9 + .5 * d.z - .4 * d.x1)))
d['yzip'] = np.where(rng.uniform(size=n) < pz, 0, rng.poisson(mu))
d['yzinb'] = np.where(rng.uniform(size=n) < pz, 0, rng.negative_binomial(th, th / (th + mu)))
mg = np.exp(5 + .25 * d.x1 + .3 * d.z)
pos = rng.uniform(size=n) < 1 / (1 + np.exp(-(.4 + .5 * d.z + .3 * d.x1)))
d['ygam'] = np.where(pos, rng.gamma(2.5, mg / 2.5), 0.0)
lat = .8 * d.x1 + .6 * d.z + rng.logistic(size=n)
d['yord'] = pd.cut(lat, [-np.inf, -1, .5, 2, np.inf], labels=['1', '2', '3', '4']).astype(int)
u1, u2 = .5 + .6 * d.x1 - .4 * d.z, -.2 - .5 * d.x1 + .7 * d.z
P = np.exp(np.c_[np.zeros(n), u1, u2]); P /= P.sum(1, keepdims=True)
d['ymn'] = [rng.choice(['ref', 'b', 'c'], p=p) for p in P]
d['cl'] = np.repeat(np.arange(70), 10)
b = np.repeat(rng.normal(0, 1.0, 70), 10)
d['ycb'] = rng.binomial(1, 1 / (1 + np.exp(-(-.5 + .6 * d.x1 + .5 * d.z + b))))
d['ycp'] = rng.poisson(np.exp(.2 + .3 * d.x1 + .3 * d.z + .6 * b))
d.to_csv('tests/sim2.csv', index=False)
X = sm.add_constant(pd.DataFrame({'x1': d.x1, 'z': d.z, 'gB': gB, 'gC': gC}))
ref = {}
m = sm.GLM(d.ypois, X, family=sm.families.Poisson()).fit(); ref['pois'] = {'beta': m.params.tolist(), 'se': m.bse.tolist(), 'll': m.llf}
m = sm.NegativeBinomial(d.ynb, X).fit(maxiter=500, disp=0); ref['nb'] = {'beta': m.params.tolist()[:-1], 'se': m.bse.tolist()[:-1], 'alpha': float(m.params.iloc[-1]), 'seAlpha': float(m.bse.iloc[-1]), 'll': m.llf}
m = sm.ZeroInflatedPoisson(d.yzip, X, exog_infl=X, inflation='logit').fit(method='bfgs', maxiter=5000, disp=0); k = X.shape[1]
se = np.sqrt(np.diag(np.linalg.inv(-approx_hess(m.params.values, m.model.loglike))))  # EE de la hessiana numérica (los EE analíticos de statsmodels para ZIP difieren)
ref['zip'] = {'zero': m.params.tolist()[:k], 'zeroSE': se[:k].tolist(), 'beta': m.params.tolist()[k:], 'se': se[k:].tolist(), 'll': m.llf}
m = sm.ZeroInflatedNegativeBinomialP(d.yzinb, X, exog_infl=X, p=2).fit(method='bfgs', maxiter=5000, disp=0)
se = np.sqrt(np.diag(np.linalg.inv(-approx_hess(m.params.values, m.model.loglike))))
ref['zinb'] = {'zero': m.params.tolist()[:k], 'beta': m.params.tolist()[k:2 * k], 'se': se[k:2 * k].tolist(), 'alpha': float(m.params.iloc[-1]), 'll': m.llf}
dp = d[d.ygam > 0]; m = sm.GLM(dp.ygam, X.loc[dp.index], family=sm.families.Gamma(sm.families.links.Log())).fit()
ref['gamma'] = {'beta': m.params.tolist(), 'se': m.bse.tolist(), 'scale': float(m.scale)}
m = OrderedModel(d.yord, X[['x1', 'z', 'gB', 'gC']], distr='logit').fit(method='bfgs', maxiter=2000, disp=0)
ref['ord'] = {'beta': m.params.tolist()[:4], 'se': m.bse.tolist()[:4], 'll': m.llf, 'thr1': float(m.params.iloc[4])}
ymn = pd.Categorical(d.ymn, categories=['ref', 'b', 'c']).codes
m = sm.MNLogit(ymn, X).fit(method='newton', disp=0)
ref['mn'] = {'b': m.params[0].tolist(), 'c': m.params[1].tolist(), 'seb': m.bse[0].tolist(), 'sec': m.bse[1].tolist(), 'll': m.llf}
# multinivel: verosimilitud por cuadratura GH (200 nodos, no adaptativa) y optimización independiente
xg, wg = np.polynomial.hermite.hermgauss(200)
Xm = X[['const', 'x1', 'z']].values
def glmm_ll(par, y, fam):
    be, sg = par[:3], np.exp(par[3]); eta = Xm @ be; tot = 0
    for c in range(70):
        s = slice(c * 10, c * 10 + 10); e = eta[s][:, None] + np.sqrt(2) * sg * xg[None, :]; yy = y[s][:, None]
        lp = (yy * e - np.logaddexp(0, e)).sum(0) if fam == 'bin' else (yy * e - np.exp(e) - special.gammaln(yy + 1)).sum(0)
        tot += special.logsumexp(lp + np.log(wg)) - .5 * np.log(np.pi)
    return -tot
for key, y, fam in (('glmmb', d.ycb.values, 'bin'), ('glmmp', d.ycp.values, 'pois')):
    r = optimize.minimize(glmm_ll, [0, 0, 0, -.3], args=(y, fam), method='BFGS', options={'gtol': 1e-8}); r = optimize.minimize(glmm_ll, r.x, args=(y, fam), method='Nelder-Mead', options={'xatol': 1e-9, 'fatol': 1e-11, 'maxiter': 4000})
    h = 1e-3; H = np.zeros((4, 4)); x0 = r.x
    for i in range(4):
        for j in range(4):
            ei, ej = np.eye(4)[i] * h, np.eye(4)[j] * h
            H[i, j] = (glmm_ll(x0 + ei + ej, y, fam) - glmm_ll(x0 + ei - ej, y, fam) - glmm_ll(x0 - ei + ej, y, fam) + glmm_ll(x0 - ei - ej, y, fam)) / (4 * h * h)
    V = np.linalg.inv(H); ref[key] = {'beta': x0[:3].tolist(), 'sigma': float(np.exp(x0[3])), 'se': np.sqrt(np.diag(V))[:3].tolist(), 'll': float(-r.fun)}
json.dump(ref, open('tests/reference2.json', 'w'), indent=1)
print(json.dumps(ref)[:900])
