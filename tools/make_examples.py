# Genera los conjuntos de datos SIMULADOS de examples/ (nefrología; datos ficticios, solo para demostración).
import numpy as np, pandas as pd
rng = np.random.default_rng(2026)
yn = lambda m: np.where(m, 'Sí', 'No')
def miss(d, col, p):
    d.loc[rng.uniform(size=len(d)) < p, col] = np.nan

# 1) Hemodiálisis: depresión (transversal) -> Poisson robusta (RP), logística, lineal (PHQ-9)
n = 260
d = pd.DataFrame({'ID': np.arange(1, n + 1)})
d['Edad'] = np.clip(rng.normal(58, 14, n), 20, 90).round()
d['Grupo de edad'] = np.where(d.Edad >= 60, '≥ 60 años', np.where(d.Edad >= 40, '40 a 59 años', '18 a 39 años'))
d['Sexo'] = rng.choice(['Masculino', 'Femenino'], n, p=[.58, .42])
d['Diabetes'] = yn(rng.uniform(size=n) < .45)
d['Acceso vascular'] = rng.choice(['Fístula arteriovenosa', 'Catéter venoso central'], n, p=[.62, .38])
d['Tiempo en hemodiálisis (meses)'] = np.round(rng.gamma(2, 22, n))
d['Apoyo familiar'] = rng.choice(['Adecuado', 'Insuficiente'], n, p=[.7, .3])
d['Hemoglobina (g/dL)'] = np.round(rng.normal(10.4, 1.4, n), 1)
d['Albúmina (g/dL)'] = np.round(rng.normal(3.7, .45, n), 2)
d['Kt/V'] = np.round(rng.normal(1.35, .22, n), 2)
lp = (-1.3 + .6 * (d['Acceso vascular'] == 'Catéter venoso central') + .5 * (d['Apoyo familiar'] == 'Insuficiente') + .35 * (d.Diabetes == 'Sí')
      + .3 * (d.Sexo == 'Femenino') - .35 * (d['Hemoglobina (g/dL)'] - 10.4) - .5 * (d['Albúmina (g/dL)'] - 3.7))
d['Puntaje PHQ-9'] = np.clip(np.round(8 + 3 * lp + rng.normal(0, 3.5, n)), 0, 27)
d['Depresión'] = yn(rng.uniform(size=n) < 1 / (1 + np.exp(-lp)))
miss(d, 'Albúmina (g/dL)', .08); miss(d, 'Kt/V', .1)
d.loc[rng.uniform(size=n) < np.where(d.Edad >= 70, .22, .05), 'Puntaje PHQ-9'] = np.nan   # MAR: falta más en mayores
d.loc[rng.uniform(size=n) < .04, 'Apoyo familiar'] = ''
d.to_csv('examples/hemodialisis_depresion.csv', index=False)

# 2) Hemodiálisis: mortalidad (cohorte) -> Cox, Kaplan-Meier
n = 450
c = pd.DataFrame({'ID': np.arange(1, n + 1)})
c['Acceso vascular'] = rng.choice(['Fístula arteriovenosa', 'Catéter venoso central'], n, p=[.6, .4])
c['Edad'] = np.clip(rng.normal(62, 12, n), 20, 90).round()
c['Sexo'] = rng.choice(['Femenino', 'Masculino'], n)
c['Diabetes'] = yn(rng.uniform(size=n) < .48)
c['Índice de Charlson'] = rng.poisson(4, n)
c['Albúmina (g/dL)'] = np.round(rng.normal(3.6, .5, n), 2)
c['Hemoglobina (g/dL)'] = np.round(rng.normal(10.3, 1.5, n), 1)
h = np.exp(-4.4 + .55 * (c['Acceso vascular'] == 'Catéter venoso central') + .03 * (c.Edad - 62) + .3 * (c.Diabetes == 'Sí') + .12 * (c['Índice de Charlson'] - 4) - .6 * (c['Albúmina (g/dL)'] - 3.6))
t = rng.exponential(1 / h); cens = rng.uniform(6, 60, n)
c['Tiempo de seguimiento (meses)'] = np.round(np.minimum(t, cens), 1).clip(0.1)
c['Fallecido'] = yn(t <= cens)
c.loc[rng.uniform(size=n) < np.where(c['Índice de Charlson'] >= 6, .2, .06), 'Albúmina (g/dL)'] = np.nan
c.to_csv('examples/hemodialisis_mortalidad.csv', index=False)

# 3) ERC: TFGe en el tiempo (longitudinal) -> modelo mixto, GEE
k = 150; rows = []
for i in range(k):
    g = 'iSGLT2' if i % 2 else 'Tratamiento estándar'; e = rng.normal(63, 10); s = rng.choice(['Femenino', 'Masculino']); dm = rng.uniform() < .55; b = rng.normal(0, 7)
    base = 48 + b - .2 * (e - 63); last = rng.choice([12, 18]) if rng.uniform() < .22 else 24
    for v in [0, 6, 12, 18, 24]:
        tfg = base - (.32 if g == 'Tratamiento estándar' else .12) * v - (.08 * v if dm else 0) + rng.normal(0, 3)
        alb = rng.uniform() < 1 / (1 + np.exp(-(-0.4 + .9 * dm - .025 * (tfg - 45) + (-.5 if g == 'iSGLT2' and v > 0 else 0))))
        rows.append({'ID': i + 1, 'Mes': v, 'Tratamiento': g, 'Edad': round(e), 'Sexo': s, 'Diabetes': 'Sí' if dm else 'No',
                     'TFGe (mL/min/1.73 m²)': round(tfg, 1) if v <= last else np.nan, 'Albuminuria A3': ('Sí' if alb else 'No') if v <= last else ''})
pd.DataFrame(rows).to_csv('examples/erc_tfge_longitudinal.csv', index=False)

# 4) Lesión renal aguda tras cirugía cardiaca (cohorte) -> logística (OR) o Poisson robusta (RR)
n = 520
a = pd.DataFrame({'ID': np.arange(1, n + 1)})
a['Edad'] = np.clip(rng.normal(64, 11, n), 25, 90).round()
a['Sexo'] = rng.choice(['Masculino', 'Femenino'], n, p=[.65, .35])
a['Diabetes'] = yn(rng.uniform(size=n) < .35)
a['TFGe basal (mL/min/1.73 m²)'] = np.round(np.clip(rng.normal(72, 20, n), 15, 130))
a['Fracción de eyección (%)'] = np.round(np.clip(rng.normal(52, 11, n), 15, 75))
a['Tipo de cirugía'] = rng.choice(['Revascularización', 'Valvular', 'Combinada'], n, p=[.55, .3, .15])
a['Tiempo de bypass (min)'] = np.round(rng.gamma(9, 11, n))
a['Bypass prolongado (> 120 min)'] = yn(a['Tiempo de bypass (min)'] > 120)
a['Vasopresores'] = yn(rng.uniform(size=n) < .3)
lp = -2.6 + .7 * (a['Bypass prolongado (> 120 min)'] == 'Sí') + .03 * (a.Edad - 64) - .025 * (a['TFGe basal (mL/min/1.73 m²)'] - 72) + .4 * (a.Diabetes == 'Sí') + .5 * (a.Vasopresores == 'Sí') + .4 * (a['Tipo de cirugía'] == 'Combinada')
a['LRA (KDIGO)'] = yn(rng.uniform(size=n) < 1 / (1 + np.exp(-lp)))
miss(a, 'Fracción de eyección (%)', .07)
a.loc[rng.uniform(size=n) < np.where(a.Edad >= 75, .15, .04), 'TFGe basal (mL/min/1.73 m²)'] = np.nan
a.to_csv('examples/lesion_renal_aguda.csv', index=False)

# 5) Trasplante renal: supervivencia del injerto (cohorte) -> Cox
n = 380
t5 = pd.DataFrame({'ID': np.arange(1, n + 1)})
t5['Tipo de donante'] = rng.choice(['Vivo', 'Fallecido'], n, p=[.45, .55])
t5['Edad del receptor'] = np.clip(rng.normal(44, 13, n), 18, 75).round()
t5['Sexo'] = rng.choice(['Femenino', 'Masculino'], n)
t5['Isquemia fría (horas)'] = np.round(np.where(t5['Tipo de donante'] == 'Vivo', rng.gamma(2, 1, n), rng.gamma(6, 2.8, n)), 1)
t5['Incompatibilidades HLA'] = rng.integers(0, 7, n)
t5['Rechazo agudo'] = yn(rng.uniform(size=n) < .18)
h = np.exp(-3.9 + .45 * (t5['Tipo de donante'] == 'Fallecido') + .03 * (t5['Isquemia fría (horas)'] - 10) + .12 * (t5['Incompatibilidades HLA'] - 3) + .8 * (t5['Rechazo agudo'] == 'Sí'))
tt = rng.exponential(1 / h); cens = rng.uniform(1, 10, n)
t5['Tiempo de seguimiento (años)'] = np.round(np.minimum(tt, cens), 2).clip(0.05)
t5['Pérdida del injerto'] = yn(tt <= cens)
miss(t5, 'Isquemia fría (horas)', .09)
t5.to_csv('examples/trasplante_injerto.csv', index=False)

# 6) Diálisis peritoneal: episodios de peritonitis (conteo con persona-tiempo) -> Poisson robusta (RTI, offset)
n = 300
p6 = pd.DataFrame({'ID': np.arange(1, n + 1)})
p6['Programa de entrenamiento'] = rng.choice(['Convencional', 'Estructurado'], n)
p6['Edad'] = np.clip(rng.normal(52, 14, n), 18, 85).round()
p6['Diabetes'] = yn(rng.uniform(size=n) < .4)
p6['Albúmina (g/dL)'] = np.round(rng.normal(3.5, .5, n), 2)
p6['Tiempo en diálisis peritoneal (años)'] = np.round(rng.uniform(.3, 4, n), 2)
rate = np.exp(-1.0 - .5 * (p6['Programa de entrenamiento'] == 'Estructurado') + .35 * (p6.Diabetes == 'Sí') - .4 * (p6['Albúmina (g/dL)'] - 3.5))
p6['Episodios de peritonitis'] = rng.poisson(rate * p6['Tiempo en diálisis peritoneal (años)'])
miss(p6, 'Albúmina (g/dL)', .06)
p6.to_csv('examples/dialisis_peritonitis.csv', index=False)
print('ok')
