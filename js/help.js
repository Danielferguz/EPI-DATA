// Contenido de la pestaña «Métodos y ayuda».
export const HELP_HTML = `
<h2>EPI-DATA en 8 pasos</h2>
<ol>
<li><b>Datos:</b> cargue su base o un ejemplo de nefrología; corrija nombres, tipos, categoría de referencia y de evento; renombre o agrupe categorías.</li>
<li><b>Base de datos:</b> revise todas las filas; los datos perdidos aparecen sombreados.</li>
<li><b>Pregunta y modelo:</b> elija el objetivo (causal, explicativo o predictivo), el desenlace, la exposición o variable de intervención y las covariables.</li>
<li><b>Descriptivo:</b> Tabla 1 por grupos.</li>
<li><b>Datos perdidos:</b> magnitud, pérdida según exposición y desenlace, MCAR/MAR/MNAR e imputación múltiple con método por variable.</li>
<li><b>Resultados:</b> elija cómo tratar los perdidos (casos completos, imputación simple o múltiple) y compare con y sin imputación; forest con n, resumen del desenlace por grupo y estimados crudo y ajustado; interpretación en lenguaje sencillo; supuestos al final con explicación.</li>
<li><b>Modelización:</b> selección de covariables, confusión, modificación de efecto y comparación de modelos.</li>
<li><b>Reporte:</b> métodos y tablas para el manuscrito.</li>
</ol>
<h2>Falacia de la Tabla 2</h2>
<p>En un modelo construido para estimar el efecto causal de una intervención, el coeficiente de cada confusor <b>no</b> es el efecto de ese confusor: para estimarlo habría que ajustar por otro conjunto de variables (sus propios confusores) y no ajustar por sus mediadores, entre ellos la propia intervención. Presentar e interpretar todos los coeficientes de un modelo multivariable como «factores de riesgo» es la falacia de la Tabla 2 (Westreich y Greenland, Am J Epidemiol 2013;177:292-8). Por eso, cuando el objetivo es causal, EPI-DATA muestra por defecto solo el efecto de la intervención.</p>
<h2>Flujo de trabajo</h2>
<ol>
<li><b>Datos.</b> Suba un CSV o Excel con una fila por participante (o por medición, en datos longitudinales). Revise el tipo de cada variable, la <b>categoría de referencia</b> y, en desenlaces binarios, la categoría de <b>evento</b>. Genere la Tabla 1.</li>
<li><b>Datos perdidos.</b> Cuantifique la pérdida, explore el mecanismo (MCAR, MAR, MNAR) e impute con MICE si corresponde.</li>
<li><b>Modelos de regresión.</b> Elija el análisis, el desenlace, la exposición principal y las covariables. Se obtiene un forest plot con los modelos crudo y ajustado, la tabla de coeficientes y la evaluación de supuestos.</li>
<li><b>Modelización multivariable.</b> Selección de covariables, confusión (cambio en el estimado), modificación de efecto y comparación de modelos.</li>
<li><b>Reporte.</b> Texto de métodos (español o inglés), tablas en Word/CSV y figuras SVG/PNG/TIFF a 300–1200 ppp.</li>
</ol>

<h2>¿Qué modelo usar?</h2>
<table class="data"><thead><tr><th>Desenlace</th><th>Diseño</th><th>Modelo</th><th>Medida</th></tr></thead><tbody>
<tr><td>Cuantitativo</td><td>Transversal / cohorte</td><td>Regresión lineal</td><td>β (diferencia de medias)</td></tr>
<tr><td>Binario poco frecuente (&lt; 10 %) o casos y controles</td><td>Cualquiera</td><td>Regresión logística</td><td>OR</td></tr>
<tr><td>Binario frecuente</td><td>Transversal</td><td>Poisson con varianza robusta</td><td>Razón de prevalencias (RP)</td></tr>
<tr><td>Binario frecuente</td><td>Cohorte con seguimiento fijo</td><td>Poisson con varianza robusta</td><td>Riesgo relativo (RR)</td></tr>
<tr><td>Conteo / tasa</td><td>Persona-tiempo</td><td>Poisson robusta con offset log(tiempo)</td><td>Razón de tasas (RTI)</td></tr>
<tr><td>Tiempo hasta el evento (con censura)</td><td>Cohorte</td><td>Kaplan-Meier, log-rank, Cox</td><td>HR</td></tr>
<tr><td>Medidas repetidas</td><td>Longitudinal</td><td>GEE (efecto poblacional) o modelo mixto (efecto condicional)</td><td>β, OR o RR</td></tr>
</tbody></table>

<h2>Modelos y supuestos evaluados</h2>
<h3>Regresión lineal</h3>
<p>Mínimos cuadrados ordinarios; opción de errores estándar robustos HC0, HC1 o HC3. Supuestos: <b>normalidad de residuos</b> (Shapiro-Wilk, gráfico Q-Q, histograma), <b>homocedasticidad</b> (Breusch-Pagan studentizado de Koenker), <b>linealidad / especificación</b> (RESET de Ramsey con ŷ² e ŷ³; gráfico de residuos parciales con lowess), <b>colinealidad</b> (GVIF de Fox y Monette; [GVIF^(1/(2·gl))]² comparable con el VIF clásico; umbral 5–10), <b>observaciones influyentes</b> (distancia de Cook; &gt; 4/n para revisar, &gt; 1 influencia extrema) y tamaño muestral (≥ 10 observaciones por parámetro).</p>
<h3>Regresión logística</h3>
<p>Máxima verosimilitud por IRLS; IC de Wald. Supuestos y desempeño: <b>eventos por variable</b> (EPV ≥ 10), <b>separación</b> (coeficientes enormes o falta de convergencia), <b>linealidad del logit</b> (Box-Tidwell: término x·ln x), <b>calibración</b> (Hosmer-Lemeshow con 10 grupos y gráfico por deciles), <b>discriminación</b> (AUC-ROC con IC de Hanley-McNeil), colinealidad e influencia. Si el desenlace es frecuente (&gt; 10 %), el OR se aleja de la RP: considere Poisson robusta.</p>
<h3>Poisson con varianza robusta</h3>
<p>Modelo log-lineal de Poisson con estimador sándwich (HC0, como <code>sandwich::vcovHC(type="HC0")</code> en R o <code>vce(robust)</code> sin corrección en Stata) que corrige la varianza cuando el desenlace es binario (Zou 2004; Barros y Hirakata 2003). Estima RP o RR directamente. Se informan predicciones &gt; 1, linealidad en la escala log, colinealidad, influencia y, en conteos, sobredispersión. Admite offset log(persona-tiempo).</p>
<h3>Supervivencia</h3>
<p>Kaplan-Meier con IC de Greenwood en escala log (como <code>survfit</code> de R), mediana de supervivencia, prueba de log-rank para k grupos y tabla de número en riesgo. Regresión de Cox con empates de Efron. Supuestos: <b>riesgos proporcionales</b> mediante residuos de Schoenfeld escalados con prueba de Grambsch-Therneau por término y global (transformación Kaplan-Meier del tiempo) y gráficos β(t) con lowess; <b>EPV</b>; discriminación con el índice C de Harrell.</p>
<h3>Análisis longitudinal</h3>
<p><b>GEE</b> (Liang y Zeger 1986): familias gaussiana, binomial (logit) y Poisson (log), correlación de trabajo independiente, intercambiable o AR(1) (estimadores de momentos como statsmodels/geepack) y errores estándar robustos sándwich; comparación de estructuras con <b>QIC</b> (Pan 2001). Recomendado con ≥ 40 sujetos. <b>Modelo lineal mixto</b> con intercepto aleatorio por sujeto, estimado por REML; se informa la varianza entre sujetos, el coeficiente de correlación intraclase (CCI) y la prueba de razón de verosimilitud del efecto aleatorio (mezcla χ²₀:χ²₁). Para estimar si la evolución difiere entre grupos, incluya la interacción <i>grupo × tiempo</i>. Se grafican el perfil medio con IC 95 % y las trayectorias individuales.</p>

<h2>Datos perdidos</h2>
<table class="data"><thead><tr><th>Mecanismo</th><th>Definición</th><th>Cómo se explora</th><th>Análisis recomendado</th></tr></thead><tbody>
<tr><td><b>MCAR</b></td><td>La pérdida no depende de ningún valor, observado o no.</td><td>Prueba de Little (no significativa) y ninguna variable asociada a la pérdida.</td><td>Casos completos (insesgado, menos potencia) o imputación múltiple.</td></tr>
<tr><td><b>MAR</b></td><td>La pérdida depende solo de variables observadas.</td><td>Comparación entre quienes tienen y no tienen el dato (t de Welch, χ²) y regresión logística del indicador de pérdida.</td><td>Imputación múltiple incluyendo las variables que predicen la pérdida y el desenlace.</td></tr>
<tr><td><b>MNAR</b></td><td>La pérdida depende del propio valor no observado.</td><td>No es verificable con los datos.</td><td>Análisis de sensibilidad (ajuste δ, patrón-mezcla) y discusión.</td></tr>
</tbody></table>
<p><b>Prueba MCAR de Little (1988).</b> Estima medias y covarianzas por EM bajo normalidad multivariante y compara las medias de cada patrón de pérdida con las globales: d² = Σ n<sub>j</sub>(ȳ<sub>j</sub> − μ<sub>j</sub>)ᵀ Σ<sub>j</sub>⁻¹ (ȳ<sub>j</sub> − μ<sub>j</sub>), con Σp<sub>j</sub> − p grados de libertad (como <code>naniar::mcar_test</code>). Un resultado no significativo no demuestra MCAR (baja potencia).</p>
<p><b>MICE.</b> Imputación múltiple por ecuaciones encadenadas (van Buuren y Groothuis-Oudshoorn 2011): emparejamiento por media predictiva (PMM, 5 donantes, regresión bayesiana como <code>mice.impute.pmm</code>) para cuantitativas, regresión logística con extracción de parámetros para binarias y logística multinomial con bootstrap para politómicas. Se muestran gráficos de convergencia y de observados vs imputados, y puede descargarse el conjunto imputado en formato largo (<code>.imp</code>, <code>.id</code>). Los modelos se ajustan en cada imputación y se combinan con las <b>reglas de Rubin</b>, con grados de libertad de Barnard-Rubin, fracción de información perdida (FMI) y prueba de Wald multiparámetro D1 para variables con varias categorías. Como regla práctica, use m ≥ porcentaje de casos incompletos. En datos longitudinales en formato largo, MICE no modela la correlación intra-sujeto: úsela con cautela o impute en formato ancho; el modelo mixto y GEE con casos disponibles son válidos bajo MAR/MCAR respectivamente.</p>
<p><b>Sensibilidad δ (MNAR).</b> Se repite MICE sumando δ a los valores imputados de una variable (o δ al log-odds en binarias) y se grafica el efecto de la exposición frente a δ para identificar el punto de inflexión en que la conclusión cambiaría.</p>

<h2>Modelización multivariable</h2>
<ul>
<li><b>Selección intencionada</b> (Hosmer, Lemeshow y Sturdivant 2013; Bursac et al. 2008): candidatas con p &lt; 0.25 en el análisis bivariado; eliminación iterativa de variables con p &gt; 0.10 salvo que su retiro cambie algún coeficiente más de 20 % (confusión); reingreso de no candidatas con p &lt; 0.15. La exposición principal se mantiene siempre.</li>
<li><b>Eliminación hacia atrás</b> por AIC (QIC en GEE) o por valor p (prueba de Wald del término completo).</li>
<li><b>Confusión</b>: cambio relativo del efecto de la exposición al retirar cada covariable (criterio del 10 %).</li>
<li><b>Modificación de efecto</b>: término exposición × covariable, prueba de Wald y efectos de la exposición por estrato (combinaciones lineales; para covariables cuantitativas en sus percentiles 25, 50 y 75).</li>
<li><b>Comparación de modelos</b>: AIC, BIC y prueba de razón de verosimilitud.</li>
</ul>
<p class="warn">La selección automática no reemplaza el razonamiento causal. Para estimar el efecto de una exposición, elija las covariables por conocimiento previo (p. ej., un diagrama causal / DAG) y use estas herramientas como apoyo.</p>

<h2>Formato de los datos</h2>
<ul>
<li>Celdas vacías y los códigos indicados (por defecto <code>NA</code>, <code>.</code>, <code>-</code>, <code>999</code>, <code>9999</code>) se tratan como perdidos.</li>
<li>Una variable numérica con pocos valores enteros (p. ej., 0/1 o una escala 1–5) se detecta como categórica; cámbiela a cuantitativa si corresponde.</li>
<li>Datos longitudinales en formato largo: una fila por sujeto y visita, con identificador, tiempo y desenlace.</li>
<li>Supervivencia: tiempo de seguimiento &gt; 0 y un indicador de evento (p. ej., 1 = evento, 0 = censura).</li>
</ul>

<h2>Validación</h2>
<p>Los motores se comparan con statsmodels y scipy (MCO y HC3, logística, Poisson robusta HC0, Cox de Efron, GEE gaussiana y binomial intercambiables, modelo mixto REML, Kaplan-Meier, log-rank, Shapiro-Wilk, χ², Fisher, Welch, Mann-Whitney, Kruskal-Wallis) y con una implementación independiente de la prueba de Little: <code>node tests/validate.mjs</code>. Diferencias &lt; 1e-5 (1e-4 en GEE y modelo mixto).</p>

<h2>Referencias</h2>
<p class="small">Barros AJD, Hirakata VN. BMC Med Res Methodol 2003;3:21 · Zou G. Am J Epidemiol 2004;159:702-6 · Hosmer DW, Lemeshow S, Sturdivant RX. Applied Logistic Regression, 3.ª ed. Wiley 2013 · Bursac Z, et al. Source Code Biol Med 2008;3:17 · Greenland S. Am J Public Health 1989;79:340-9 · Maldonado G, Greenland S. Am J Epidemiol 1993;138:923-36 · Fox J, Monette G. J Am Stat Assoc 1992;87:178-83 · Grambsch PM, Therneau TM. Biometrika 1994;81:515-26 · Liang KY, Zeger SL. Biometrika 1986;73:13-22 · Pan W. Biometrics 2001;57:120-5 · Little RJA. J Am Stat Assoc 1988;83:1198-202 · Rubin DB. Multiple Imputation for Nonresponse in Surveys. Wiley 1987 · Barnard J, Rubin DB. Biometrika 1999;86:948-55 · van Buuren S, Groothuis-Oudshoorn K. J Stat Softw 2011;45(3) · van Buuren S. Flexible Imputation of Missing Data, 2.ª ed. CRC 2018 · Sterne JAC, et al. BMJ 2009;338:b2393 · Westreich D, Greenland S. Am J Epidemiol 2013;177:292-8 · Gelman A, Hill J. Data Analysis Using Regression and Multilevel/Hierarchical Models. Cambridge 2007 · Lüdecke D, et al. performance: J Open Source Softw 2021;6:3139 · Royston P. Appl Stat 1995;44:547-51.</p>
`;
