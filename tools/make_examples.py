# Genera los conjuntos de datos simulados de examples/ (datos ficticios, solo para demostración).
import numpy as np, pandas as pd
rng = np.random.default_rng(2026)

# 1) Transversal: dolor crónico y depresión
n = 212
edad = np.clip(rng.normal(56, 13, n), 20, 90).round()
d = pd.DataFrame({'id': np.arange(1, n + 1), 'edad': edad})
d['grupo_edad'] = np.where(edad >= 60, '≥ 60 años', np.where(edad >= 40, '40 a 59 años', '20 a 39 años'))
d['sexo'] = rng.choice(['Masculino', 'Femenino'], n, p=[.6, .4])
d['estado_civil'] = rng.choice(['Casado', 'Conviviente', 'Soltero', 'Viudo/divorciado'], n, p=[.52, .11, .15, .22])
d['habitos_nocivos'] = rng.choice(['No', 'Sí'], n, p=[.95, .05])
d['relacion_familiar'] = rng.choice(['Funcional', 'Disfuncional'], n, p=[.76, .24])
d['comorbilidad'] = rng.choice(['No', 'Sí'], n, p=[.29, .71])
d['dolor_poliarticular'] = rng.choice(['No', 'Sí'], n, p=[.86, .14])
d['tiempo_dolor'] = rng.choice(['≥ 12 meses', '7 a 11 meses', '3 a 6 meses'], n, p=[.31, .22, .47])
d['intensidad_eva'] = np.clip(rng.normal(6, 2, n), 0, 10).round(1)
d['intensidad_dolor'] = np.where(d.intensidad_eva < 4, 'Leve', np.where(d.intensidad_eva < 7, 'Moderado', 'Severo'))
d['terapia_psicologia'] = rng.choice(['No', 'Sí'], n, p=[.93, .07])
d['terapia_fisica'] = rng.choice(['No', 'Sí'], n, p=[.25, .75])
lp = (-0.6 + .9 * (d.comorbilidad == 'Sí') + .6 * (d.dolor_poliarticular == 'Sí') + .7 * (d.intensidad_dolor == 'Severo')
      + .9 * (d.terapia_psicologia == 'Sí') + .4 * (d.sexo == 'Femenino') + .02 * (edad - 56))
d['phq9'] = np.clip(np.round(7 + 2.2 * lp + rng.normal(0, 3, n)), 0, 27)
d['depresion'] = np.where(rng.uniform(size=n) < 1 / (1 + np.exp(-lp)), 'Sí', 'No')
# perdidos MAR: el PHQ-9 falta más en mayores; la EVA más en hombres; estado civil al azar
d.loc[rng.uniform(size=n) < np.where(edad >= 65, .25, .05), 'phq9'] = np.nan
d.loc[rng.uniform(size=n) < np.where(d.sexo == 'Masculino', .14, .04), 'intensidad_eva'] = np.nan
d.loc[d.intensidad_eva.isna(), 'intensidad_dolor'] = ''
d.loc[rng.uniform(size=n) < .05, 'estado_civil'] = ''
d.to_csv('examples/dolor_depresion.csv', index=False)

# 2) Cohorte: supervivencia
n = 400
c = pd.DataFrame({'id': np.arange(1, n + 1), 'tratamiento': rng.choice(['Estándar', 'Nuevo'], n), 'edad': rng.normal(62, 10, n).round(),
                  'sexo': rng.choice(['Femenino', 'Masculino'], n), 'estadio': rng.choice(['I', 'II', 'III'], n, p=[.35, .4, .25])})
c['albumina'] = rng.normal(3.8, .5, n).round(2)
h = np.exp(-4.2 - .5 * (c.tratamiento == 'Nuevo') + .03 * (c.edad - 62) + .6 * (c.estadio == 'II') + 1.2 * (c.estadio == 'III') - .5 * (c.albumina - 3.8))
t = rng.exponential(1 / h); cens = rng.uniform(6, 60, n)
c['tiempo_meses'] = np.round(np.minimum(t, cens), 1).clip(0.1); c['muerte'] = (t <= cens).astype(int)
c.loc[rng.uniform(size=n) < np.where(c.estadio == 'III', .2, .06), 'albumina'] = np.nan
c.to_csv('examples/cohorte_supervivencia.csv', index=False)

# 3) Longitudinal: presión arterial sistólica
k = 120; visits = [0, 3, 6, 9, 12]
rows = []
for i in range(k):
    g = 'Intervención' if i % 2 else 'Control'; e = rng.normal(55, 9); s = rng.choice(['Femenino', 'Masculino']); b = rng.normal(0, 8)
    drop = rng.uniform() < .25; last = rng.choice([6, 9]) if drop else 12
    for v in visits:
        pas = 152 + b + .3 * (e - 55) - (.4 if g == 'Control' else 1.3) * v + rng.normal(0, 6)
        rows.append({'id': i + 1, 'mes': v, 'grupo': g, 'edad': round(e), 'sexo': s, 'pas': round(pas, 1) if v <= last else np.nan,
                     'pa_controlada': ('Sí' if pas < 140 else 'No') if v <= last else ''})
pd.DataFrame(rows).to_csv('examples/longitudinal_presion.csv', index=False)
print('ok')
