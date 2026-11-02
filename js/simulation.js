// Deterministic daily economic, political and social simulation.
function tick(days = 1) {
  if (!Number.isInteger(days) || days < 1 || days > 1000) throw new RangeError('Avanza entre 1 y 1000 días.');
  for (let day = 0; day < days; day++) advanceDay();
  snapshot(); save(); render();
}
function advanceDay() {
  city.day++;
  const demand = { food: 0, energy: 0, clothes: 0 };
  const supply = { food: 0, energy: 0, clothes: 0 };
  const activeFirms = city.firms.filter(firm => firm.active);
  const agentsById = new Map(city.agents.map(agent => [agent.id, agent]));
  const residentsByHome = new Map();
  for (const agent of city.agents) { if (!residentsByHome.has(agent.home)) residentsByHome.set(agent.home, []); residentsByHome.get(agent.home).push(agent); }
  const relationshipsByPair = new Map(city.relationships.map(relationship => [pairKey(relationship.a, relationship.b), relationship]));

  produceAndPay(activeFirms, agentsById, supply);

  for (const agent of city.agents) simulateAgent(agent, activeFirms, demand, residentsByHome, relationshipsByPair);
  updateMarket(activeFirms, demand, supply);
  collectTaxesAndFundServices();
  processBusinessFailures(activeFirms, agentsById);
  processGovernmentAndEvents();
  if (city.day % 7 === 0) spreadOneKnowledge();
  if (city.day % 30 === 0) expandHousing();
  if (city.day % 7 === 0) record(city, 'city', `Día ${city.day}: ${city.agents.length} residentes tomaron decisiones y comerciaron.`);
}
function produceAndPay(activeFirms, agentsById, supply) {
  for (const firm of activeFirms) {
    if (!Object.hasOwn(supply, firm.good)) continue;
    const employees = firm.employees.map(id => agentsById.get(id)).filter(Boolean);
    const skillBonus = employees.reduce((sum, worker) => sum + (worker.brain.procedural.work_search || .1) * .12 + (worker.education === 'superior' ? .08 : worker.education === 'media' ? .04 : 0), 0);
    const produced = Math.max(1, employees.length * (.3 + (employees.length ? skillBonus / employees.length : 0)) + 1);
    firm.inventory += produced; supply[firm.good] += produced;
    firm.cash -= 1.25 + employees.length * .04;
    if (city.day % 7 === 0 && employees.length) {
      const wage = Math.max(0, Math.min(18, firm.cash / employees.length));
      for (const employee of employees) {
        const tax = wage * Math.max(0, Math.min(.3, city.tax_rate));
        employee.money += wage - tax; city.treasury += tax; firm.cash -= wage;
      }
    }
  }
}
function simulateAgent(agent, activeFirms, demand, residentsByHome, relationshipsByPair) {
  const options = [];
  if (agent.needs.food < .86) options.push('buy_food');
  if (agent.needs.energy < .82) options.push('buy_energy');
  if (agent.needs.clothes < .72) options.push('buy_clothes');
  if (agent.age >= 18 && !agent.job) options.push('seek_work');
  if (city.day % 4 === agent.brain.seed % 4 && agent.traits.sociability > .18) options.push('socialize');
  if (city.day % 9 === agent.brain.seed % 9 && agent.traits.kindness > .58) options.push('help_neighbor');
  if (city.day % 30 === agent.brain.seed % 30 && agent.education !== 'superior') options.push('study');
  if (agent.needs.stress > .35 || agent.needs.energy < .38) options.push('rest');
  options.push('save_money');
  const decision = decide(agent, options), action = decision?.action;

  if (action === 'buy_food') buyGood(agent, 'food', activeFirms, demand);
  if (action === 'buy_energy') buyGood(agent, 'energy', activeFirms, demand);
  if (action === 'buy_clothes') buyGood(agent, 'clothes', activeFirms, demand);
  if (action === 'seek_work') findJob(agent, activeFirms);
  if (action === 'socialize') socialize(agent, residentsByHome, relationshipsByPair);
  if (action === 'help_neighbor') helpNeighbor(agent, residentsByHome, relationshipsByPair);
  if (action === 'save_money') learn(agent, 'save_money', agent.needs.food < .2 ? -.35 : .07);
  if (action === 'rest') {
    agent.needs.energy = Math.min(1, agent.needs.energy + .22);
    agent.needs.stress = Math.max(0, agent.needs.stress - .22);
    learn(agent, 'rest', .2);
  }
  if (action === 'study') {
    const levels = ['básica','media','superior'];
    agent.brain.education_progress += .35 + agent.traits.curiosity * .2;
    if (agent.brain.education_progress >= 1) {
      const current = Math.max(0, levels.indexOf(agent.education));
      agent.education = levels[Math.min(levels.length - 1, current + 1)]; agent.brain.education_progress -= 1;
      record(city, 'learning', `${agent.name} completó un nivel de estudios: ${agent.education}.`);
      learn(agent, 'study', .65, { key: 'learning:education', text: `Estudiar permitió avanzar a educación ${agent.education}.` });
    } else learn(agent, 'study', .22);
    remember(agent, `Estudió; progreso escolar ${Math.round(agent.brain.education_progress * 100)}%.`, 'education', .45);
  }

  // Needs respond to both environment and the agent's own daily choices.
  agent.needs.food = Math.max(0, agent.needs.food - .075);
  agent.needs.energy = Math.max(0, agent.needs.energy - (agent.job ? .075 : .052));
  agent.needs.belonging = Math.max(0, agent.needs.belonging - .012);
  agent.needs.clothes = Math.max(0, agent.needs.clothes - .0015);
  agent.needs.stress = Math.min(1, Math.max(0, agent.needs.stress + (agent.job ? .012 : -.006) + (agent.needs.food < .18 ? .025 : 0)));
  if (agent.needs.food < .22) agent.needs.health = Math.max(0, agent.needs.health - .012);
  else if (agent.needs.food > .65 && agent.needs.energy > .45) agent.needs.health = Math.min(1, agent.needs.health + .002);
  if (city.day % 7 === 0) {
    agent.money = Math.max(0, agent.money - 1.4);
    if (agent.job) agent.money += 0; // Payroll is settled by firms at the start of the day.
  }
  if (city.day % 365 === 0 && agent.age < 110) agent.age++;
}

function buyGood(agent, good, firms, demand) {
  const price = city.prices[good];
  const firm = firms.filter(item => item.good === good && item.inventory >= .05)
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))[0];
  if (!firm || agent.money < price) {
    learn(agent, `buy_${good}`, -0.18, { key: `market_failure:${good}`, text: `No pude comprar ${good === 'clothes' ? 'ropa' : good === 'food' ? 'alimentos' : 'energía'} por falta de existencias o dinero.` });
    return;
  }
  const quantity = Math.min(1, firm.inventory, agent.money / price);
  const cost = quantity * price;
  if (!Number.isFinite(cost) || cost <= 0) { learn(agent, `buy_${good}`, -.2); return; }
  agent.money -= cost; firm.cash += cost; firm.inventory -= quantity; demand[good] += quantity;
  if (good === 'food') { const starving = agent.needs.food < .2; agent.needs.food = Math.min(1, agent.needs.food + .4 * quantity); agent.needs.health = Math.min(1, agent.needs.health + (starving ? .025 : .006) * quantity); }
  if (good === 'energy') agent.needs.energy = Math.min(1, agent.needs.energy + .34 * quantity);
  if (good === 'clothes') agent.needs.clothes = Math.min(1, agent.needs.clothes + .55 * quantity);
  if (firm.price !== price) firm.price = price;
  learn(agent, `buy_${good}`, quantity >= .5 ? .7 : .2, {
    key: `market:${good}`, text: `${{food:'Alimentos',energy:'Energía',clothes:'Ropa'}[good]} cuesta cerca de ${price.toFixed(2)} créditos.`
  });
  if (agent.brain.semantic[`market:${good}`]) agent.brain.semantic[`market:${good}`].uses++;
}
function findJob(agent, activeFirms) {
  const firm = activeFirms.filter(item => item.employees.length < Math.max(2, city.agents.length / 9))
    .sort((a, b) => (a.employees.length / Math.max(1, city.agents.length / 9)) - (b.employees.length / Math.max(1, city.agents.length / 9)) || b.cash - a.cash || a.id.localeCompare(b.id))[0];
  if (!firm) { learn(agent, 'seek_work', -.25); remember(agent, 'No encontró una vacante disponible.', 'employment', .45); return; }
  firm.employees.push(agent.id); agent.job = firm.id;
  learn(agent, 'seek_work', .65, { key: 'employment_success', text: 'Buscar empleo puede conseguir trabajo en una empresa.' });
}
function helpNeighbor(agent, residentsByHome, relationshipsByPair) {
  const neighbors = residentsByHome.get(agent.home) || [];
  const eligible = neighbors.filter(other => other.id !== agent.id && other.money < 25 && agent.money > 30);
  if (!eligible.length) { learn(agent, 'help_neighbor', -.04); return; }
  const other = eligible[(agent.brain.seed + city.day) % eligible.length], donation = Math.min(5, agent.money - 20);
  agent.money -= donation; other.money += donation;
  agent.needs.belonging = Math.min(1, agent.needs.belonging + .04);
  const key = pairKey(agent.id, other.id), relation = relationshipsByPair.get(key);
  if (relation) relation.score = Math.min(1, relation.score + .04);
  else { const created = { a: agent.id, b: other.id, kind: 'apoyo', score: .28 }; city.relationships.push(created); relationshipsByPair.set(key, created); }
  bondCacheDay = -1;
  remember(agent, `Ayudó económicamente a ${other.name}.`, 'altruism', .65);
  remember(other, `${agent.name} le ayudó cuando necesitaba dinero.`, 'gratitude', .8);
  learn(agent, 'help_neighbor', .5); learn(other, 'help_neighbor', .2);
}
function pairKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function socialize(agent, residentsByHome, relationshipsByPair) {
  const residents = residentsByHome.get(agent.home) || [];
  if (residents.length < 2) { learn(agent, 'socialize', -.05); return; }
  const ownIndex = residents.indexOf(agent);
  const other = residents[(ownIndex + 1 + (agent.brain.seed + city.day) % (residents.length - 1)) % residents.length];
  const key = pairKey(agent.id, other.id);
  const relationship = relationshipsByPair.get(key);
  if (relationship) relationship.score = Math.min(1, relationship.score + .02);
  else { const created = { a: agent.id, b: other.id, kind: 'amistad', score: .2 }; city.relationships.push(created); relationshipsByPair.set(key, created); }
  bondCacheDay = -1;
  agent.needs.belonging = Math.min(1, agent.needs.belonging + .08);
  remember(agent, `Conversó con ${other.name}.`, 'social', .5);
  learn(agent, 'socialize', .35);
}
function updateMarket(firms, demand, supply) {
  for (const good of Object.keys(GOODS)) {
    const scarcity = (demand[good] + 1) / (supply[good] + 1);
    const nextPrice = city.prices[good] * (.92 + .08 * scarcity);
    city.prices[good] = +Math.max(GOODS[good] * .35, Math.min(GOODS[good] * 3, nextPrice)).toFixed(2);
    for (const firm of firms) if (firm.good === good) firm.price = city.prices[good];
  }
}
function collectTaxesAndFundServices() {
  if (city.treasury >= 150 && city.day % 7 === 0) {
    city.treasury -= 150;
    for (const agent of city.agents) {
      agent.needs.belonging = Math.min(1, agent.needs.belonging + .008);
      if (city.policy === 'Servicios públicos') agent.needs.health = Math.min(1, agent.needs.health + .012);
      if (city.policy === 'Educación comunitaria' && agent.education !== 'superior' && agent.traits.curiosity > .65) agent.brain.education_progress = Math.min(1, agent.brain.education_progress + .1);
      if (city.policy === 'Impulso a empresas' && agent.job) agent.needs.stress = Math.max(0, agent.needs.stress - .01);
    }
  }
}
function processBusinessFailures(activeFirms, agentsById) {
  for (const firm of activeFirms) {
    if (firm.cash < 0) {
      firm.active = false;
      for (const id of firm.employees) { const worker = agentsById.get(id); if (worker) worker.job = null; }
      record(city, 'economy', `${firm.name} quebró; ${firm.employees.length} empleos quedaron vacantes.`);
    }
  }
  // A limited, transparent recovery fund prevents permanent shortages if every supplier of a good fails.
  if (city.day % 30 === 0) {
    for (const good of Object.keys(GOODS)) {
      if (city.firms.some(firm => firm.active && firm.good === good)) continue;
      const candidate = city.firms.filter(firm => firm.good === good && !firm.active).sort((a,b)=>b.inventory-a.inventory||a.id.localeCompare(b.id))[0];
      const grant = good === 'food' ? 600 : 350;
      if (!candidate || city.treasury < grant) continue;
      city.treasury -= grant; candidate.cash = grant; candidate.inventory = Math.max(8,candidate.inventory); candidate.active = true; candidate.employees = [];
      record(city, 'economy', `Fondo de recuperación reabrió ${candidate.name} para restablecer el suministro de ${good === 'food' ? 'alimentos' : good === 'energy' ? 'energía' : 'ropa'}.`);
    }
  }
}
function processGovernmentAndEvents() {
  if (city.day >= city.next_election) {
    const candidates = ['Camila Cruz', 'Diego Flores', 'Maya Torres', 'Alicia Alvarez'];
    city.mayor = candidates[Math.floor(cityRandom() * candidates.length)];
    city.next_election += 365;
    city.policy = ['Servicios públicos', 'Educación comunitaria', 'Impulso a empresas'][Math.floor(cityRandom() * 3)];
    city.tax_rate = [.05, .08, .1, .12][Math.floor(cityRandom() * 4)];
    record(city, 'government', `Elección: ${city.mayor}. Política: ${city.policy}. Impuesto ${Math.round(city.tax_rate * 100)}%.`);
  }
  if (cityRandom() < .035) {
    const event = Math.floor(cityRandom() * 3);
    if (event === 0) {
      for (const agent of city.agents) { agent.needs.belonging = Math.min(1, agent.needs.belonging + .12); agent.needs.stress = Math.max(0, agent.needs.stress - .08); }
      record(city, 'event', 'Festival vecinal: crece el bienestar social.');
    } else if (event === 1) {
      for (const firm of city.firms.filter(item => item.active)) firm.inventory *= .92;
      record(city, 'event', 'Tormenta: se pierde parte del inventario.');
    } else {
      record(city, 'event', 'Descubrimiento comunitario: una nueva idea inspira a la ciudad.');
    }
  }
}
function spreadOneKnowledge() {
  const learned = [];
  for (const agent of city.agents) for (const [key, fact] of Object.entries(agent.brain.semantic)) {
    if (fact.source === 'learned' && fact.confidence >= .55) learned.push({ agent, key, fact });
  }
  if (!learned.length) return;
  const source = learned[Math.floor(cityRandom() * learned.length)];
  const adjacency = new Map();
  for (const relationship of city.relationships) {
    if (!adjacency.has(relationship.a)) adjacency.set(relationship.a, []);
    if (!adjacency.has(relationship.b)) adjacency.set(relationship.b, []);
    adjacency.get(relationship.a).push([relationship.b, relationship.score]);
    adjacency.get(relationship.b).push([relationship.a, relationship.score]);
  }
  const agentsById = new Map(city.agents.map(agent => [agent.id, agent]));
  let frontier = [[source.agent.id, source.fact.confidence]], visited = new Set([source.agent.id]), delivered = 0;
  for (let hop = 0; hop < 2; hop++) {
    const next = [];
    for (const [personId, confidence] of frontier) for (const [neighborId, trust] of adjacency.get(personId) || []) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      const recipient = agentsById.get(neighborId);
      if (!recipient) continue;
      if (!recipient.brain.semantic[source.key]) {
        const receivedConfidence = +(confidence * trust * .65).toFixed(2);
        recipient.brain.semantic[source.key] = { text: source.fact.text, source: 'social', source_agent: personId, confidence: receivedConfidence, verified: false, uses: 0 };
        remember(recipient, `${source.agent.name} compartió conocimiento: ${source.fact.text}`, 'testimony', .35);
        delivered++;
      }
      next.push([neighborId, confidence * trust * .65]);
    }
    frontier = next;
  }
  if (delivered) record(city, 'learning', `La comunidad transmitió ${source.key} a ${delivered} residentes; los testimonios aún no están verificados.`);
}
function expandHousing() {
  const housing = city.buildings.filter(building => building.kind === 'housing');
  if (!housing.length || housing.reduce((sum, building) => sum + building.occupants, 0) / housing.reduce((sum, building) => sum + building.capacity, 0) < .9) return;
  const index = city.buildings.length;
  const building = { id: `b${index}`, name: `Barrio ${index - 10}`, kind: 'housing', x: .1 + cityRandom() * .8, y: .1 + cityRandom() * .8, capacity: Math.max(24, city.agents.length / Math.max(1, housing.length)), occupants: 0 };
  city.buildings.push(building);
  const residents = city.agents.filter(agent => housing.some(home => home.id === agent.home)).sort((a, b) => a.id.localeCompare(b.id));
  for (const resident of residents) {
    if (building.occupants >= building.capacity) break;
    if (cityRandom() < .08) {
      const oldHome = housing.find(home => home.id === resident.home);
      if (oldHome) oldHome.occupants--;
      resident.home = building.id; building.occupants++;
    }
  }
  record(city, 'urban', `Se construyó ${building.name} para atender la expansión urbana.`);
}
