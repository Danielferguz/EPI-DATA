# Genera tests/reference.json con valores de referencia (statsmodels / scipy) para validar los motores JS.
import json, numpy as np, pandas as pd, statsmodels.api as sm, statsmodels.formula.api as smf
from scipy import stats
rng = np.random.default_rng(7)
n = 300
d = pd.DataFrame({'x1': rng.normal(50, 10, n), 'g': rng.choice(['A', 'B', 'C'], n), 'z': rng.binomial(1, .4, n)})
eta = -6 + .1 * d.x1 + .5 * (d.g == 'B') - .4 * (d.g == 'C') + .7 * d.z
d['ybin'] = rng.binomial(1, 1 / (1 + np.exp(-eta)))
d['ycont'] = 3 + .2 * d.x1 + 1.5 * (d.g == 'B') + rng.normal(0, 2, n)
d['ycnt'] = rng.poisson(np.exp(-1 + .02 * d.x1))
d['time'] = np.round(rng.exponential(1 / np.exp(-4 + .05 * d.x1 + .5 * d.z)), 1) + 0.1
d['status'] = rng.binomial(1, .75, n)
d['id'] = np.repeat(np.arange(60), 5)
d['t'] = np.tile(np.arange(5), 60)
b0 = np.repeat(rng.normal(0, 2, 60), 5)
d['ylong'] = 10 + .5 * d.t + .8 * d.z + b0 + rng.normal(0, 1.5, n)
d['x1m'] = d.x1.where(rng.uniform(size=n) > 0.15 + 0.3 * d.z)
d['ycm'] = d.ycont.where(rng.uniform(size=n) > 0.1)
d.to_csv('tests/sim.csv', index=False)
X = pd.get_dummies(d[['x1', 'g', 'z']], columns=['g'], drop_first=True).astype(float); X = sm.add_constant(X)[['const', 'x1', 'z', 'g_B', 'g_C']]
ref = {}
m = sm.OLS(d.ycont, X).fit(); ref['ols'] = {'beta': m.params.tolist(), 'se': m.bse.tolist(), 'r2': m.rsquared, 'aic': m.aic, 'hc3': m.get_robustcov_results('HC3').bse.tolist()}
m = sm.GLM(d.ybin, X, family=sm.families.Binomial()).fit(); ref['logit'] = {'beta': m.params.tolist(), 'se': m.bse.tolist(), 'll': m.llf, 'aic': m.aic}
m = sm.GLM(d.ybin, X, family=sm.families.Poisson()).fit(cov_type='HC0'); ref['poisrob'] = {'beta': m.params.tolist(), 'se': m.bse.tolist()}
Xc = X.drop(columns='const')
m = sm.PHReg(d.time, Xc, status=d.status, ties='efron').fit(); ref['cox'] = {'beta': m.params.tolist(), 'se': m.bse.tolist(), 'll': m.llf}
m = sm.GEE(d.ylong, sm.add_constant(d[['t', 'z']]), groups=d.id, cov_struct=sm.cov_struct.Exchangeable()).fit(); ref['gee'] = {'beta': m.params.tolist(), 'se': m.bse.tolist(), 'alpha': m.cov_struct.dep_params}
Xg = sm.add_constant(d[['t', 'z']])
m = sm.GEE(d.ybin, Xg, groups=d.id, family=sm.families.Binomial(), cov_struct=sm.cov_struct.Exchangeable()).fit(); ref['geebin'] = {'beta': m.params.tolist(), 'se': m.bse.tolist()}
m = smf.mixedlm('ylong ~ t + z', d, groups=d['id']).fit(reml=True); ref['lmm'] = {'beta': m.fe_params.tolist(), 'se': m.bse_fe.tolist(), 'tau2': float(m.cov_re.iloc[0, 0]), 'sigma2': m.scale}
ref['shapiro'] = [list(stats.shapiro(d.x1[:k])) for k in (3, 7, 20, 300)]
tab = pd.crosstab(d.g, d.ybin).values; ref['chisq'] = stats.chi2_contingency(tab, correction=False)[:2]
ref['fisher'] = stats.fisher_exact([[3, 9], [8, 2]])[1]
ref['welch'] = stats.ttest_ind(d.x1[d.z == 1], d.x1[d.z == 0], equal_var=False).pvalue
ref['mw'] = stats.mannwhitneyu(d.x1[d.z == 1], d.x1[d.z == 0], use_continuity=True, alternative='two-sided').pvalue
ref['kw'] = stats.kruskal(*[d.x1[d.g == k] for k in 'ABC']).pvalue
ref['dist'] = {'pt': stats.t.cdf(-2.1, 7), 'qt': stats.t.ppf(.975, 13), 'pchisq': stats.chi2.sf(7.3, 3), 'qnorm': stats.norm.ppf(.001), 'pf': stats.f.sf(2.7, 3, 40), 'qchisq': stats.chi2.ppf(.95, 4)}
# log-rank por z
from statsmodels.duration.survfunc import survdiff, SurvfuncRight
ref['logrank'] = list(survdiff(d.time, d.status, d.g))
sf = SurvfuncRight(d.time, d.status); ref['km'] = {'surv_at_10': float(sf.surv_prob[np.searchsorted(sf.surv_times, 10, side='right') - 1]), 'median': float(sf.quantile(.5))}
# Little MCAR: implementación independiente (EM en numpy)
def little(Y):
    Y = Y[~np.all(np.isnan(Y), 1)]; n, p = Y.shape
    mu = np.nanmean(Y, 0); S = np.diag(np.nanvar(Y, 0))
    for _ in range(2000):
        T1 = np.zeros(p); T2 = np.zeros((p, p))
        for r in Y:
            o = ~np.isnan(r); m = ~o; x = r.copy(); C = np.zeros((p, p))
            if m.any():
                B = S[np.ix_(m, o)] @ np.linalg.inv(S[np.ix_(o, o)])
                x[m] = mu[m] + B @ (r[o] - mu[o]); C[np.ix_(m, m)] = S[np.ix_(m, m)] - B @ S[np.ix_(o, m)]
            T1 += x; T2 += np.outer(x, x) + C
        nmu = T1 / n; nS = T2 / n - np.outer(nmu, nmu)
        done = max(np.abs(nmu - mu).max(), np.abs(nS - S).max()) < 1e-10; mu, S = nmu, nS
        if done: break
    keys = [tuple(~np.isnan(r)) for r in Y]; d2 = 0; df = 0
    for k in set(keys):
        rows = Y[[kk == k for kk in keys]]; o = np.array(k)
        dv = rows[:, o].mean(0) - mu[o]; d2 += len(rows) * dv @ np.linalg.inv(S[np.ix_(o, o)]) @ dv; df += o.sum()
    df -= p
    return [float(d2), int(df), float(stats.chi2.sf(d2, df))]
ref['little'] = little(d[['x1m', 'ycm', 'z']].values.astype(float))
json.dump(ref, open('tests/reference.json', 'w'), indent=1)
print(json.dumps(ref)[:600])
