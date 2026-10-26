# Conjuntos SIMULADOS adicionales (conteos, continuos positivos, desenlaces categóricos y multinivel). Datos ficticios, solo demostración.
import numpy as np, pandas as pd
rng = np.random.default_rng(2027)
yn = lambda m: np.where(m, 'Sí', 'No')
sig = lambda x: 1 / (1 + np.exp(-x))
def miss(d, col, p, w=None):
    pr = p if w is None else p * w
    d.loc[rng.uniform(size=len(d)) < pr, col] = np.nan

# 1) ERC: utilización de servicios (conteos con ceros, gasto y estancia)
n = 500
d = pd.DataFrame({'ID': np.arange(1, n + 1)})
d['Edad'] = np.clip(rng.normal(64, 12, n), 25, 92).round()
d['Sexo'] = rng.choice(['Masculino', 'Femenino'], n, p=[.55, .45])
d['Diabetes'] = yn(rng.uniform(size=n) < .45)
d['Programa de educación en ERC'] = yn(rng.uniform(size=n) < .45)
d['TFGe (mL/min/1.73 m²)'] = np.round(np.clip(rng.normal(38, 14, n), 8, 85), 1)
d['Albuminuria (mg/g)'] = np.round(np.exp(rng.normal(4.8, 1.1, n)))
d['Seguimiento (años)'] = np.round(rng.uniform(0.5, 2.0, n), 2)
dm, pr, fem = (d.Diabetes == 'Sí') * 1., (d['Programa de educación en ERC'] == 'Sí') * 1., (d.Sexo == 'Femenino') * 1.
mu = np.exp(.1 + .5 * dm + .015 * (d.Edad - 64) - .02 * (d['TFGe (mL/min/1.73 m²)'] - 38) - .3 * pr) * d['Seguimiento (años)']
z1 = rng.uniform(size=n) < sig(-.7 + .9 * pr - .02 * (d.Edad - 64))          # ceros estructurales: sin necesidad de urgencias
d['Consultas de urgencias'] = np.where(z1, 0, rng.poisson(mu))
mu2 = np.exp(-.2 + .55 * dm + .02 * (d.Edad - 64) - .02 * (d['TFGe (mL/min/1.73 m²)'] - 38) - .35 * pr) * d['Seguimiento (años)']
th = 1 / .8; z2 = rng.uniform(size=n) < sig(-1.0 + .4 * fem - .3 * pr)
d['Ingresos hospitalarios'] = np.where(z2, 0, rng.negative_binomial(th, th / (th + mu2)))
pos = rng.uniform(size=n) < sig(.9 + .6 * dm + .5 * pr - .01 * (d.Edad - 64))
m3 = np.exp(7.2 + .4 * dm + .012 * (d.Edad - 64) - .2 * pr)
d['Gasto en salud (USD/año)'] = np.where(pos, np.round(rng.gamma(2.2, m3 / 2.2)), 0)
ing = d['Ingresos hospitalarios'] > 0
d['Estancia de la primera hospitalización (días)'] = np.where(ing, np.round(np.maximum(rng.gamma(3, np.exp(1.6 + .25 * dm + .01 * (d.Edad - 64)) / 3), .5) * 2) / 2, np.nan)
miss(d, 'TFGe (mL/min/1.73 m²)', .06); d.loc[rng.uniform(size=n) < np.where(d.Edad >= 72, .2, .06), 'Albuminuria (mg/g)'] = np.nan
d.to_csv('examples/erc_utilizacion.csv', index=False)

# 2) ERC: desenlaces categóricos (ordinal y nominal)
n = 600
c = pd.DataFrame({'ID': np.arange(1, n + 1)})
c['Edad'] = np.clip(rng.normal(61, 13, n), 20, 92).round()
c['Sexo'] = rng.choice(['Masculino', 'Femenino'], n)
c['Diabetes'] = yn(rng.uniform(size=n) < .42)
c['Apoyo familiar'] = rng.choice(['Adecuado', 'Insuficiente'], n, p=[.68, .32])
c['Albuminuria alta (≥ 300 mg/g)'] = yn(rng.uniform(size=n) < .35)
c['Años de estudio'] = np.clip(np.round(rng.normal(10, 4, n)), 0, 20)
dm, ap, al = (c.Diabetes == 'Sí') * 1., (c['Apoyo familiar'] == 'Insuficiente') * 1., (c['Albuminuria alta (≥ 300 mg/g)'] == 'Sí') * 1.
lat = .9 * dm + .8 * al + .03 * (c.Edad - 61) + rng.logistic(size=n)
c['Estadio de ERC'] = pd.cut(lat, [-np.inf, .3, 1.8, np.inf], labels=['G3 (moderada)', 'G4 (grave)', 'G5 (falla renal)']).astype(str)
lq = -.6 * dm - .7 * ap + .08 * (c['Años de estudio'] - 10) - .01 * (c.Edad - 61) + rng.logistic(size=n)
c['Calidad de vida'] = pd.cut(lq, [-np.inf, -1.5, -.2, 1.2, np.inf], labels=['1 Mala', '2 Regular', '3 Buena', '4 Muy buena']).astype(str)
u = np.c_[np.zeros(n), .3 - .04 * (c.Edad - 61) + .35 * dm - .3 * ap + .05 * (c['Años de estudio'] - 10), -.5 - .08 * (c.Edad - 61) - .5 * dm - .6 * ap + .08 * (c['Años de estudio'] - 10), -.9 + .02 * (c.Edad - 61) + .3 * dm + .4 * ap]
P = np.exp(u); P /= P.sum(1, keepdims=True)
c['Modalidad elegida'] = [rng.choice(['Hemodiálisis', 'Diálisis peritoneal', 'Trasplante', 'Tratamiento conservador'], p=p) for p in P]
c.loc[rng.uniform(size=n) < .05, 'Años de estudio'] = np.nan
c.to_csv('examples/erc_categoricas.csv', index=False)

# 3) Centros de diálisis (multinivel: pacientes dentro de centros)
k = 30; sizes = rng.integers(15, 50, k); n = sizes.sum()
m = pd.DataFrame({'ID': np.arange(1, n + 1), 'Centro': np.repeat([f'C{j + 1:02d}' for j in range(k)], sizes)})
tipo = rng.choice(['Público', 'Privado'], k, p=[.6, .4]); m['Tipo de centro'] = np.repeat(tipo, sizes)
u = np.repeat(rng.normal(0, .7, k), sizes); u2 = np.repeat(rng.normal(0, .5, k), sizes); u3 = np.repeat(rng.normal(0, .25, k), sizes)
m['Edad'] = np.clip(rng.normal(60, 14, n), 20, 90).round()
m['Sexo'] = rng.choice(['Masculino', 'Femenino'], n)
m['Diabetes'] = yn(rng.uniform(size=n) < .45)
m['Catéter venoso central'] = yn(rng.uniform(size=n) < .35)
m['Albúmina (g/dL)'] = np.round(rng.normal(3.7, .45, n), 2)
cat, dm = (m['Catéter venoso central'] == 'Sí') * 1., (m.Diabetes == 'Sí') * 1.
pri = (m['Tipo de centro'] == 'Privado') * 1.
lp = -1.9 + .75 * cat + .3 * dm - .45 * (m['Albúmina (g/dL)'] - 3.7) + .01 * (m.Edad - 60) - .35 * pri + u
m['Hospitalización por infección'] = yn(rng.uniform(size=n) < sig(lp))
m['Episodios de infección'] = rng.poisson(np.exp(-1.2 + .6 * cat + .25 * dm - .3 * (m['Albúmina (g/dL)'] - 3.7) - .25 * pri + u2))
m['Kt/V'] = np.round(1.35 - .06 * (m.Sexo == 'Femenino') - .08 * cat + .1 * pri + u3 + rng.normal(0, .2, n), 2)
m.loc[rng.uniform(size=n) < .06, 'Albúmina (g/dL)'] = np.nan
m.to_csv('examples/centros_dialisis.csv', index=False)
print('ok', len(d), len(c), len(m))
