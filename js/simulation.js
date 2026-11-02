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

  for (const firm of activeFirms) {
    const employees = firm.employees.map(id => agentsById.get(id)).filter(Boolean);
    const produced = Math.max(1, employees.length * .3 + 1);
    firm.inventory += produced;
    supply[firm.good] += produced;
    firm.cash -= 1.25 + employees.length * .04;
    if (city.day % 7 === 0 && employees.length) {
      const wage = Math.max(0, Math.min(18, firm.cash / employees.length));
      for (const employee of employees) { employee.money += wage; firm.cash -= wage; }
    }
  }

  for (const agent of city.agents) simulateAgent(agent, activeFirms, demand, residentsByHome, relationshipsByPair);
  updateMarket(activeFirms, demand, supply);
  collectTaxesAndFundServices();
  processBusinessFailures(activeFirms, agentsById);
  processGovernmentAndEvents();
  if (city.day % 7 === 0) spreadOneKnowledge();
  if (city.day % 30 === 0) expandHousing();
  if (city.day % 7 === 0) record(city, 'city', `Día ${city.day}: ${city.agents.length} residentes tomaron decisiones y comerciaron.`);
}
function simulateAgent(agent, activeFirms, demand, residentsByHome, relationshipsByPair) {
  const options = [];
  if (agent.needs.food < .78) options.push('buy_food');
  if (agent.needs.energy < .78) options.push('buy_energy');
  if (agent.age >= 18 && !agent.job) options.push('seek_work');
  if (city.day % 5 === 0 && agent.traits.sociability > .2) options.push('socialize');
  if (city.day % 30 === 0 && agent.education !== 'superior') options.push('study');
  options.push('save_money');
  const decision = decide(agent, options);
  const action = decision?.action;

  if (action === 'buy_food') buyGood(agent, 'food', activeFirms, demand);
  if (action === 'buy_energy') buyGood(agent, 'energy', activeFirms, demand);
  if (action === 'seek_work') findJob(agent, activeFirms);
  if (action === 'socialize') socialize(agent, residentsByHome, relationshipsByPair);
  if (action === 'save_money') learn(agent, 'save_money', agent.needs.food < .3 ? -.25 : .08);
  if (action === 'study') {
    agent.education = 'superior';
    learn(agent, 'study', .4, { key: 'learning:education', text: 'Estudiar mejoró mi educación.' });
  }

  agent.needs.food = Math.max(0, agent.needs.food - .085);
  agent.needs.energy = Math.max(0, agent.needs.energy - .06);
  agent.needs.belonging = Math.max(0, agent.needs.belonging - .018);
  if (city.day % 7 === 0) agent.money = Math.max(0, agent.money - 2);
}
function buyGood(agent, good, firms, demand) {
  const price = city.prices[good];
  const firm = firms.filter(item => item.good === good && item.inventory >= .05)
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))[0];
  if (!firm || agent.money < price) return;
  const quantity = Math.min(1, firm.inventory, agent.money / price);
  const cost = quantity * price;
  if (!Number.isFinite(cost) || cost <= 0) return;
  agent.money -= cost; firm.cash += cost; firm.inventory -= quantity; demand[good] += quantity;
  agent.needs[good] = Math.min(1, agent.needs[good] + (good === 'food' ? .38 : .3) * quantity);
  if (firm.price !== price) firm.price = price;
  learn(agent, `buy_${good}`, quantity >= .5 ? .7 : .2, {
    key: `market:${good}`, text: `${good === 'food' ? 'Alimentos' : 'Energía'} cuesta cerca de ${price.toFixed(2)} créditos.`
  });
  if (agent.brain.semantic[`market:${good}`]) agent.brain.semantic[`market:${good}`].uses++;
}
function findJob(agent, activeFirms) {
  const firm = activeFirms.filter(item => item.employees.length < Math.max(2, city.agents.length / 9))
    .sort((a, b) => a.employees.length - b.employees.length || a.id.localeCompare(b.id))[0];
  if (!firm) { learn(agent, 'seek_work', -.25); return; }
  firm.employees.push(agent.id); agent.job = firm.id;
  learn(agent, 'seek_work', .65, { key: 'employment_success', text: 'Buscar empleo puede conseguir trabajo en una empresa.' });
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
  const revenue = city.agents.reduce((sum, agent) => sum + agent.money * city.tax_rate * .012, 0);
  city.treasury += revenue;
  if (city.treasury > 150 && city.day % 7 === 0) {
    city.treasury -= 150;
    for (const agent of city.agents) agent.needs.belonging = Math.min(1, agent.needs.belonging + .005);
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
      for (const agent of city.agents) agent.needs.belonging = Math.min(1, agent.needs.belonging + .12);
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
  const building = { id: `b${index}`, name: `Barrio ${index - 10}`, kind: 'housing', x: .1 + cityRandom() * .8, y: .1 + cityRandom() * .8, capacity: Math.max(24, city.agents.length / 8), occupants: 0 };
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
