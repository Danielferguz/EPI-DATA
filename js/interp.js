// Interpretación en lenguaje sencillo del efecto de la exposición (o intervención) en el modelo ajustado y el crudo.
const f2 = v => (!isFinite(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
const fp = p => (!isFinite(p) ? '' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
const lc = s => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// qué mide cada medida (sujeto de la frase)
function what(R, meta) {
  const s = R.spec, M = R.M, yv = s.type === 'cox' ? s.status : s.y, ev = meta[yv]?.event, y = lc(yv);
  const ev_ = meta[yv]?.type === 'cat' ? `${y} (${ev})` : y;
  return {
    OR: `las odds (posibilidades) de ${ev_}`, RP: `la prevalencia de ${ev_}`, RR: `el riesgo de ${ev_}`, RTI: `la tasa de ${y}`,
    HR: `el riesgo instantáneo (hazard) de ${ev_} a lo largo del seguimiento`, 'β': `${y}`,
  }[M.measure] || y;
}
function sentence(R, meta, row, e, adjusted) {
  const s = R.spec, M = R.M, causal = s.objective === 'causal', W = what(R, meta), E = s.exposure, m = meta[E];
  const who = m.type === 'num' ? `por cada unidad adicional de ${lc(E)}` : `en ${lc(E)} = «${row.label}» frente a «${m.ref}» (referencia)`;
  const sig = !(M.exp ? e.lo <= 1 && e.hi >= 1 : e.lo <= 0 && e.hi >= 0);
  const verb = causal ? 'el efecto estimado fue' : 'se asoció con';
  let core;
  if (M.exp) {
    const pc = (e.est - 1) * 100, dir = pc >= 0 ? `${f2(pc)} % mayor` : `${f2(-pc)} % menor`;
    core = `${who}, ${W} fue ${f2(e.est)} veces (${dir})`;
    if (M.measure === 'OR' && !causal) core += '';
  } else {
    core = `${who}, ${W} ${causal ? 'cambió en' : 'fue en promedio'} ${f2(Math.abs(e.est))} unidades ${e.est >= 0 ? 'más' : 'menos'}`;
  }
  const ci = `(${M.measure} ${f2(e.est)}; IC 95 %: ${f2(e.lo)} a ${f2(e.hi)}; ${fp(e.p)})`;
  const tail = sig ? '' : ` El intervalo de confianza incluye el valor de no efecto (${M.exp ? 1 : 0}), por lo que los datos son compatibles con ausencia de ${causal ? 'efecto' : 'asociación'} y con efectos en ambas direcciones; no significa que se haya demostrado que no hay ${causal ? 'efecto' : 'asociación'}.`;
  return `${adjusted ? 'Ajustado por las covariables' : 'Sin ajustar (crudo)'}, ${core} ${ci}.${tail}`.replace(' ,', ',');
}
export function interpretExposure(R, meta) {
  const s = R.spec; if (!s.exposure) return '';
  const rows = R.table.filter(r => r.kind === 'row' && r.v === s.exposure && !r.ref && r.adj);
  const ref = R.table.find(r => r.kind === 'row' && r.v === s.exposure && r.ref);
  const causal = s.objective === 'causal', pred = s.objective === 'prediccion';
  let h = `<p><b>${causal ? 'Variable de intervención' : 'Exposición principal'}: ${esc(s.exposure)}.</b> ${ref ? `Categoría de referencia: «${esc(ref.label)}».` : 'Variable cuantitativa: el efecto se expresa por cada unidad.'}</p><ul>`;
  for (const r of rows) {
    h += `<li><b>${esc(r.label)}</b>: ${esc(sentence(R, meta, r, r.adj, true))}`;
    if (r.crude && isFinite(r.crude.est)) {
      const ch = R.M.exp ? (r.adj.est - r.crude.est) / r.crude.est : (r.adj.est - r.crude.est) / Math.abs(r.crude.est || 1);
      h += ` <span class="sub">Estimado crudo: ${f2(r.crude.est)} (${f2(r.crude.lo)} a ${f2(r.crude.hi)}). El ajuste lo modificó en ${f2(ch * 100)} %${Math.abs(ch) >= 0.1 ? ', lo que sugiere confusión por las covariables' : ''}.</span>`;
    }
    h += '</li>';
  }
  h += '</ul>';
  if (s.inter?.some(p => p.includes(s.exposure))) h += '<p class="warn">El modelo incluye una interacción con la exposición: el efecto mostrado corresponde a la categoría de referencia (o al valor 0) de la otra variable. Consulte los efectos por estrato en el paso «Modelización multivariable».</p>';
  if (R.M.measure === 'OR') h += '<p class="sub">El OR se aproxima al riesgo relativo solo si el desenlace es poco frecuente (&lt; 10 %). Con desenlaces frecuentes, interprete como «odds» o use Poisson con varianza robusta.</p>';
  if (R.M.measure === 'HR') h += '<p class="sub">El HR compara la velocidad con que ocurre el evento entre grupos, suponiendo que esa razón es constante en el tiempo (riesgos proporcionales; ver supuestos).</p>';
  if (causal) h += '<p class="sub">Interpretación causal válida solo si se cumplen: (1) no hay confusión no medida (todas las causas comunes de intervención y desenlace están ajustadas), (2) no se ajustó por mediadores ni colisionadores, (3) positividad (hay participantes en todos los niveles de la intervención en cada perfil de covariables) y (4) consistencia (la intervención está bien definida).</p>';
  if (pred) h += '<p class="sub">En un modelo predictivo, los coeficientes no tienen interpretación causal; valore el modelo por su discriminación y calibración (ver supuestos).</p>';
  if (R.mi) h += `<p class="sub">Estimados combinados de ${R.m} conjuntos imputados (reglas de Rubin).</p>`;
  return h;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
