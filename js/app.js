// UI actions, lifecycle management, and browser boot sequence.
function setSpeed(value) {
  const speed = Math.max(1, Math.min(20, Number(value) || 1));
  interval = 1000 / speed;
  $('speedtxt').textContent = `${speed}×`;
  if (running) { clearInterval(timer); timer = setInterval(() => tick(1), interval); }
}
function toggleRun() {
  running = !running;
  if (timer) clearInterval(timer);
  timer = running ? setInterval(() => tick(1), interval) : null;
  render();
}
function setTax() {
  const percent = Number($('taxinput').value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 30) { alert('El impuesto debe estar entre 0 y 30%.'); return; }
  city.tax_rate = percent / 100;
  record(city, 'government', `La administración fijó el impuesto en ${percent}%.`);
  save(); render();
}
function election() {
  city.day++;
  city.mayor = ['Camila Cruz','Diego Flores','Maya Torres','Alicia Alvarez'][city.day % 4];
  city.next_election = city.day + 365;
  city.policy = ['Servicios públicos','Educación comunitaria','Impulso a empresas'][city.day % 3];
  record(city, 'government', `Elección: ${city.mayor}; política ${city.policy}.`);
  snapshot(); save(); render();
}
function resetCity() {
  if (!confirm('¿Crear otra ciudad? Se borrará la partida guardada en este navegador.')) return;
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
  localStorage.removeItem(SAVE_KEY);
  city = createCity(); save(); render();
}
function bindUI() {
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (action) switch (action.dataset.action) {
      case 'tick-one': tick(1); break;
      case 'tick-month': tick(30); break;
      case 'toggle-run': toggleRun(); break;
      case 'reset': resetCity(); break;
      case 'set-tax': setTax(); break;
      case 'election': election(); break;
      case 'close-brain': closeBrain(); break;
      case 'teach': teach(action.dataset.teacher); break;
    }
    const person = event.target.closest('[data-agent-id]');
    if (person) openBrain(person.dataset.agentId);
    if (event.target === $('modal')) closeBrain();
  });
  $('speed-slider').addEventListener('input', event => setSpeed(event.target.value));
  $('filter').addEventListener('input', renderPeople);
  window.addEventListener('resize', () => city && renderChart());
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeBrain(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) { clearInterval(timer); timer = null; }
    else if (!document.hidden && running && !timer) timer = setInterval(() => tick(1), interval);
  });
}
bindUI();
load();
render();
init3D();
start3DLoop();
