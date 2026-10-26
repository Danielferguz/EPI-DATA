# EPI-DATA

Módulo de **EPI-LAB** para el **análisis epidemiológico de bases de datos clínicas propias** (CSV o Excel), con ejemplos de nefrología y una guía paso a paso pensada para personas sin formación estadística: regresión lineal, logística, Poisson con varianza robusta, supervivencia, análisis longitudinal, datos perdidos y modelización multivariable, con **evaluación de supuestos** y **forest plots de modelos crudo y ajustado**.

Todo se calcula en el navegador: los datos no salen de tu computadora. No requiere instalación ni servidor (sitio estático, compatible con GitHub Pages o Cloudflare Pages).

## Funciones

| Módulo | Contenido |
|---|---|
| Datos | CSV/XLSX; renombrar variables y agrupar categorías; vista de la base completa con perdidos resaltados; detección de tipo de variable; categoría de referencia y de evento; códigos de dato perdido; Tabla 1 con pruebas (χ², Fisher, Welch, ANOVA, Mann-Whitney, Kruskal-Wallis) elegidas según normalidad |
| Datos perdidos | Porcentaje por variable y patrones; pérdida según exposición y desenlace; prueba MCAR de Little (EM); exploración MAR (comparaciones y regresión logística del indicador de pérdida); interpretación MCAR/MAR/MNAR; MICE con método por variable (PMM, regresión bayesiana, muestra aleatoria, logística, multinomial); imputación simple (media, mediana, kNN, LOCF, categoría «Perdido»); modelos con y sin imputación con gráficos de convergencia y observados vs imputados; descarga de datos imputados; reglas de Rubin (gl de Barnard-Rubin, FMI, Wald D1); sensibilidad MNAR por ajuste δ con gráfico de punto de inflexión |
| Regresión lineal | MCO, EE robustos HC0/HC1/HC3; Shapiro-Wilk, Breusch-Pagan, RESET, GVIF, Cook, residuos parciales |
| Regresión logística | OR; EPV, separación, Box-Tidwell, prevalencia del desenlace |
| Poisson robusta | RP / RR / RTI con varianza sándwich; offset; predicciones > 1, linealidad, sobredispersión |
| Conteos | Poisson (varianza de Poisson), binomial negativa (NB2), ZIP y ZINB; sobredispersión (Pearson, LRT de α), ceros observados vs esperados, Vuong; tabla de la parte de ceros |
| Continuos positivos | Gamma (enlace log) y hurdle-Gamma (logística + Gamma) |
| Categóricos | Ordinal de odds proporcionales (umbrales, OR por punto de corte) y multinomial (todas las categorías, Wald conjunto) |
| Multinivel | Logística/Poisson con intercepto aleatorio (Gauss-Hermite adaptativa): CCI, MOR, LRT; mixto lineal (REML) |
| Supervivencia | Kaplan-Meier con IC y número en riesgo, mediana, log-rank; Cox (Efron); Schoenfeld (Grambsch-Therneau) por término y global con gráficos β(t) |
| Longitudinal | GEE (gaussiana, binomial, Poisson; independiente, intercambiable, AR-1) con QIC; modelo mixto con intercepto aleatorio (REML), CCI y LRT; perfiles medios y trayectorias |
| Modelización | Selección intencionada (Hosmer-Lemeshow/Bursac), confusión por cambio en el estimado; modificación de efecto con efectos por estrato |
| Resultados | Interpretación en lenguaje sencillo del efecto de la exposición o intervención; aviso de la falacia de la Tabla 2 en modelos causales; supuestos al final con explicación y gráficos de diagnóstico |
| Salidas | Forest crudo vs ajustado con n y resumen del desenlace por grupo (n/N (%), media ± DE o mediana (P25–P75)), sin p global; tablas Word/CSV; figuras SVG/PNG/TIFF con DPI; texto de métodos en español e inglés |

## Uso

```bash
python3 -m http.server 8000   # luego http://localhost:8000
```

Ejemplos de nefrología con datos **simulados** en `examples/` (generados con `tools/make_examples.py`):

| Archivo | Diseño | Análisis sugerido |
|---|---|---|
| `hemodialisis_depresion.csv` | Transversal | Poisson robusta (RP), logística, lineal (PHQ-9) |
| `hemodialisis_mortalidad.csv` | Cohorte | Kaplan-Meier, log-rank, Cox |
| `erc_tfge_longitudinal.csv` | Longitudinal | Modelo mixto, GEE |
| `lesion_renal_aguda.csv` | Cohorte | Poisson robusta (RR), logística |
| `trasplante_injerto.csv` | Cohorte | Supervivencia del injerto (Cox) |
| `dialisis_peritonitis.csv` | Cohorte con persona-tiempo | Poisson robusta con offset (RTI) |

Flujo en 8 pasos: datos → base de datos completa → pregunta (causal o explicativa; la predicción está en EPI-PREDIC y EPI-Maching-Learning) y modelo → descriptivo → datos perdidos → resultados → modelización → reporte. Cada paso explica qué se hace, para qué y cómo interpretarlo.

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
