// Dashboard rendering, trends, event feed and resident list.
function render() {
  const population = Math.max(1, city.agents.length);
  const employed = city.agents.filter(agent => agent.job).length;
  const wellbeing = city.agents.reduce((sum, agent) => sum + agentWellbeing(agent), 0) / population;
  $('pop').textContent = city.agents.length.toLocaleString();
  $('employment').textContent = (employed / population * 100).toFixed(1) + '%';
  $('wellbeing').textContent = Math.round(wellbeing * 100) + '%';
  $('treasury').textContent = '$' + Math.round(city.treasury).toLocaleString();
  $('tax').textContent = 'impuesto ' + Math.round(city.tax_rate * 100) + '%';
  $('firms').textContent = city.firms.filter(firm => firm.active).length + ' / ' + city.relationships.length.toLocaleString();
  $('relationships').textContent = 'relaciones sociales';
  $('date').textContent = 'Día ' + city.day;
  $('mayor').textContent = 'Alcaldía · ' + city.mayor;
  $('policy').textContent = city.policy;
  $('taxinput').value = Math.round(city.tax_rate * 100);
  $('mapmeta').textContent = city.buildings.length + ' edificios · ' + city.agents.length + ' residentes';
  $('prices').innerHTML = Object.entries(city.prices).map(([good, price]) => `<div class="price">${{food:'Alimentos',energy:'Energía',clothes:'Ropa'}[good]}<b>${price.toFixed(2)} cr</b></div>`).join('');
  $('eventcount').textContent = city.events.length + ' registros';
  renderMap(); renderChart(); renderFeed(); renderPeople();
  $('status').textContent = running ? 'SIMULANDO' : 'PAUSADA';
  $('run').textContent = running ? 'Ⅱ Pausar' : '▶ Iniciar';
  $('run').className = 'btn ' + (running ? 'stop' : 'primary');
}
function agentWellbeing(agent) {
  const need = agent.needs;
  return (need.food + need.energy + need.belonging + (need.clothes ?? .65) + (need.health ?? .9) + (1 - (need.stress ?? .1))) / 6;
}
function renderChart() {
  const canvas = $('chart'), rect = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * d)); canvas.height = Math.max(1, Math.floor(rect.height * d));
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(d,0,0,d,0,0); const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);
  if(city.history.length<2){ctx.fillStyle='#8ca0aa';ctx.fillText('Avanza días para generar tendencias.',12,30);return;}
  const series=['food','energy','clothes'],colors=['#6ee7c5','#69aef2','#f0c674'];
  const values=city.history.map(item=>series.map(good=>item.prices[good]??GOODS[good]));
  const max=Math.max(...values.flat()),min=Math.min(...values.flat());
  ctx.strokeStyle='#263641';for(let i=0;i<4;i++){const y=10+(h-28)*i/3;ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(w-6,y);ctx.stroke();}
  for(let j=0;j<3;j++){ctx.strokeStyle=colors[j];ctx.lineWidth=2;ctx.beginPath();values.forEach((v,i)=>{const x=32+(w-40)*i/(values.length-1),y=10+(h-28)*(1-(v[j]-min)/(max-min||1));i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  ctx.fillStyle='#8ca0aa';ctx.font='9px system-ui';ctx.fillText('Día '+city.history[0].day,30,h-2);ctx.fillText('Día '+city.day,w-45,h-2);
}
function renderFeed(){
 const labels={city:'Ciudad',economy:'Economía',government:'Gobierno',event:'Evento',learning:'Aprendizaje',urban:'Urbanismo'};
 $('feed').innerHTML=city.events.slice(0,55).map(event=>`<div class="event"><div class="day">DÍA ${event.day}</div><div><span class="tag ${event.category}">${labels[event.category]||event.category}</span>${esc(event.text)}</div></div>`).join('');
}
function renderPeople(){
 const query=$('filter').value.toLowerCase(),list=city.agents.filter(agent=>agent.name.toLowerCase().includes(query)||agent.id.toLowerCase().includes(query));
 $('peoplemeta').textContent=`${list.length} habitantes · selecciona para abrir NEURAL INSPECTOR`;
 $('people').innerHTML=list.slice(0,250).map(agent=>{const firm=city.firms.find(item=>item.id===agent.job&&item.active);return`<div class="person" data-agent-id="${agent.id}"><div>${esc(agent.name)}<small>${esc(firm?.name||'Busca empleo')} · ${esc(agent.education)} · ${agent.brain.learning} aprendizajes · salud ${Math.round((agent.needs.health??.9)*100)}%</small></div><span class="money">$${Math.round(agent.money)}</span></div>`;}).join('')||'<div class="notice" style="padding:12px">Sin coincidencias.</div>';
}
