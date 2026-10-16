# EPI-DATA

Aplicación web para el **análisis epidemiológico de bases de datos propias** (CSV o Excel): regresión lineal, logística, Poisson con varianza robusta, supervivencia, análisis longitudinal, datos perdidos y modelización multivariable, con **evaluación de supuestos** y **forest plots de modelos crudo y ajustado**.

Todo se calcula en el navegador: los datos no salen de tu computadora. No requiere instalación ni servidor (sitio estático, compatible con GitHub Pages o Cloudflare Pages).

## Funciones

| Módulo | Contenido |
|---|---|
| Datos | CSV/XLSX; detección de tipo de variable; categoría de referencia y de evento; códigos de dato perdido; Tabla 1 con pruebas (χ², Fisher, Welch, ANOVA, Mann-Whitney, Kruskal-Wallis) elegidas según normalidad |
| Datos perdidos | Porcentaje por variable y patrones; prueba MCAR de Little (EM); exploración MAR (comparaciones y regresión logística del indicador de pérdida); interpretación MCAR/MAR/MNAR; MICE (PMM, logística, multinomial) con gráficos de convergencia y observados vs imputados; descarga de datos imputados; reglas de Rubin (gl de Barnard-Rubin, FMI, Wald D1); sensibilidad MNAR por ajuste δ con gráfico de punto de inflexión |
| Regresión lineal | MCO, EE robustos HC0/HC1/HC3; Shapiro-Wilk, Breusch-Pagan, RESET, GVIF, Cook, residuos parciales |
| Regresión logística | OR; EPV, separación, Box-Tidwell, Hosmer-Lemeshow, calibración, AUC-ROC |
| Poisson robusta | RP / RR / RTI con varianza sándwich; offset; predicciones > 1, linealidad, sobredispersión |
| Supervivencia | Kaplan-Meier con IC y número en riesgo, mediana, log-rank; Cox (Efron); Schoenfeld (Grambsch-Therneau) por término y global con gráficos β(t); C de Harrell |
| Longitudinal | GEE (gaussiana, binomial, Poisson; independiente, intercambiable, AR-1) con QIC; modelo mixto con intercepto aleatorio (REML), CCI y LRT; perfiles medios y trayectorias |
| Modelización | Selección intencionada (Hosmer-Lemeshow/Bursac), hacia atrás por AIC/QIC o p; confusión por cambio en el estimado; modificación de efecto con efectos por estrato; comparación de modelos (AIC, BIC, LRT) |
| Salidas | Forest crudo vs ajustado estilo artículo; tablas Word/CSV; figuras SVG/PNG/TIFF con DPI; texto de métodos en español e inglés |

## Uso

```bash
python3 -m http.server 8000   # luego http://localhost:8000
```

Ejemplos con datos simulados en `examples/` (transversal, cohorte de supervivencia y longitudinal).

## Validación

```bash
python3 tools/make_reference.py   # opcional: regenera tests/reference.json (requiere statsmodels y scipy)
node tests/validate.mjs
```

Compara los motores JavaScript con statsmodels/scipy (MCO y HC3, logística, Poisson robusta, Cox de Efron, GEE, modelo mixto REML, Kaplan-Meier, log-rank, Shapiro-Wilk, pruebas bivariadas y distribuciones) y con una implementación independiente de la prueba de Little.

## Advertencia

Las comprobaciones de supuestos y la selección automática de variables son ayudas, no sustituyen el juicio epidemiológico ni un diagrama causal. MNAR no puede verificarse con los datos observados.

## Licencia y cita

© Daniel Fernández-Guzmán. Licencia **CC BY-NC-ND 4.0**. Usar la app con sus propios datos y publicar los resultados está permitido citando EPI-DATA (ver `CITATION.cff`).

## Publicar una versión nueva

`python3 tools/bump_version.py AAAA.MM.DD-N` añade `?v=…` a todos los módulos y a la hoja de estilos.
