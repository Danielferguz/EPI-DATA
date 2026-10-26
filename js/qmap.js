// Mapa «¿qué pregunta tengo?»: misma tarjeta en la portada de EPI-DATA y EPI-CAUSAL (copia del archivo; las apps no se comunican entre sí).
const Q = [
  { id: 'data', q: '¿Qué factores se asocian con el desenlace? ¿Cuánto cambia con la exposición?', a: 'EPI-DATA', href: '../EPI-DATA/', m: 'Regresión lineal, logística, Poisson, binomial negativa, ceros inflados, Gamma, ordinal, multinomial, Cox, GEE y multinivel; datos perdidos e imputación múltiple.' },
  { id: 'causal', q: '¿Cuál es el efecto causal de una intervención, ajustando por confusión?', a: 'EPI-CAUSAL', href: '../EPI-CAUSAL/', m: 'DAG y estimando, puntaje de propensión, IPTW, g-computación, AIPW, TMLE, Super Learner, balance y sensibilidad (E-value).' },
  { id: 'predic', q: '¿Quién tendrá el evento? (riesgo individual, validación)', a: 'EPI-PREDIC', href: '../EPI-PREDIC/', m: 'Modelos de regresión para predecir: discriminación, calibración, C de Harrell, selección hacia atrás, comparación de modelos, validación y actualización.' },
  { id: 'ml', q: '¿Un algoritmo flexible predice mejor que la regresión?', a: 'EPI-Maching-Learning', href: '../EPI-Maching-Learning/', m: 'Bosques, boosting, redes y Super Learner con validación cruzada anidada y validación externa.' },
  { id: 'its', q: '¿Cambió la tendencia después de una intervención o política?', a: 'EPI-ITS', href: '../epi-interrumped-time-series-analysis/', m: 'Series de tiempo interrumpidas con una a tres interrupciones y pronóstico contrafactual.' },
  { id: 'meta', q: '¿Qué dice el conjunto de estudios y qué tan seguro es?', a: 'MetaGRADE', href: '../metagrade/', m: 'Meta-análisis, subgrupos, meta-regresión, GRADE y tablas de resumen de hallazgos.' },
  { id: 'rob', q: '¿Qué tan sesgados están los estudios incluidos?', a: 'EPI-ROB', href: '../EPI-ROB/', m: 'RoB 2, ROBINS-I/E, QUADAS-2, PROBAST, AMSTAR 2 y figuras de semáforo.' },
  { id: 'fig', q: '¿Cómo presento los resultados en una figura de revista?', a: 'EPI-GRAPHICS', href: '../EPI-GRAPHICS/', m: 'Forest, PRISMA, barras, supervivencia y más, en estilo de revista.' },
];
export function qmapHTML(current) {
  const c = x => (x.id === current ? ' class="here"' : '');
  return `<h2>¿Qué pregunta tengo?</h2><p class="sub">Elija la herramienta según la pregunta. Cada aplicación es independiente: no se pasan datos entre ellas; descargue la base limpia y cárguela en la otra.</p>
<div class="qmap">${Q.map(x => `<a${c(x)} href="${x.href}" target="_blank" rel="noopener"><span class="qq">${x.q}</span><b>${x.a}${x.id === current ? ' · está aquí' : ''}</b><small>${x.m}</small></a>`).join('')}</div>`;
}
