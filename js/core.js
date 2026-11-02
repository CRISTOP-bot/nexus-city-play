// Persistent world state, deterministic random numbers and initial civilization.
'use strict';
const SAVE_KEY = 'nexus-city-living-minds-v1';
// Shared DOM lookup used by every UI and rendering module.
function $(id) { return document.getElementById(id); }
const GOODS = Object.freeze({ food: 8, energy: 5, clothes: 12 });
const COLORS = Object.freeze({ civic: '#6ee7c5', housing: '#69aef2', market: '#f0c674', industry: '#f0c674', education: '#c58cf0', park: '#80cc8a' });
const FIRST_NAMES = ['Alicia','Bruno','Camila','Diego','Elena','Fabian','Gabriela','Hugo','Ines','Javier','Karla','Luis','Maya','Nico','Olivia','Pablo','Renata','Sofia','Tomas','Valeria'];
const LAST_NAMES = ['Alvarez','Benitez','Cruz','Delgado','Escobar','Flores','Garcia','Herrera','Ibarra','Juarez','Luna','Mendez','Nava','Ortega','Perez','Quiroz','Reyes','Santos','Torres','Vega'];
let city, running = false, timer = null, interval = 1000, selected = null;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let x = Math.imul(value ^ (value >>> 15), 1 | value);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function cityRandom() {
  city.rng = (Math.imul(city.rng, 1664525) + 1013904223) >>> 0;
  return city.rng / 4294967296;
}
function createBrain(id, traits) {
  const random = seededRandom([...id].reduce((sum, char) => sum + char.charCodeAt(0), 173));
  const initialFacts = {
    employment: 'Puedes buscar empleo en empresas de la ciudad.',
    food_market: 'Los mercados venden alimentos a cambio de dinero.',
    money: 'El dinero permite intercambiar bienes y servicios.',
    social: 'Hablar con vecinos puede fortalecer relaciones.',
    needs: 'Conviene atender hambre, energía y pertenencia.',
    civic: 'La alcaldía administra impuestos y servicios públicos.'
  };
  const semantic = {};
  for (const [key, text] of Object.entries(initialFacts)) semantic[key] = { text, source: 'initial', confidence: 1, verified: true, uses: 0 };
  return {
    semantic, episodic: [], procedural: { work_search: .15, budgeting: .1, social_cooperation: .1, learning: .1, self_care: .1 },
    preferences: { risk: +(0.15 + .7 * traits.ambition).toFixed(3), saving: +(0.15 + .75 * traits.frugality).toFixed(3), sociability: traits.sociability, generosity: traits.kindness, curiosity: traits.curiosity },
    action_values: {}, action_counts: {}, decisions: [], learning: 0, seed: Math.floor(random() * 999999)
  };
}
function addEvent(world, category, text) {
  world.events.unshift({ day: world.day, category, text });
  if (world.events.length > 160) world.events.length = 160;
}
function createCity(population = 240, seed = 42) {
  const random = seededRandom(seed);
  const world = {
    schema: 4, rng: seed >>> 0, day: 0, treasury: 50000, tax_rate: .08,
    mayor: 'Alicia Alvarez', next_election: 365, policy: 'Servicios públicos',
    agents: [], firms: [], buildings: [], relationships: [], prices: { ...GOODS }, events: [], history: []
  };
  const buildingNames = ['Plaza Central','Barrio Norte','Mercado','Distrito Solar','Escuela','Parque del Río'];
  const buildingKinds = ['civic','housing','market','industry','education','park','housing','industry','market','housing','education','housing'];
  for (let i = 0; i < 12; i++) world.buildings.push({
    id: `b${i}`, name: buildingNames[i % 6], kind: buildingKinds[i % 6],
    x: .12 + (i % 4) * .24, y: .15 + Math.floor(i / 4) * .3,
    capacity: Math.max(24, population / 4), occupants: 0
  });
  const goods = Object.keys(GOODS), firms = ['Sol','Horizonte','Cometa','Raíz','Lumen','Puente','Brisa','Marea','Nopal'];
  for (let i = 0; i < firms.length; i++) {
    const good = goods[i % goods.length];
    world.firms.push({ id: `f${i}`, name: firms[i], good, employees: [], cash: 1800, inventory: 30,
      price: GOODS[good], active: true, building: `b${(i + 2) % 12}` });
  }
  const goals = ['prosperar','formar comunidad','aprender','ahorrar','emprender'];
  for (let i = 0; i < population; i++) {
    const traits = { sociability: +random().toFixed(2), ambition: +random().toFixed(2), frugality: +random().toFixed(2), curiosity: +random().toFixed(2), kindness: +random().toFixed(2), conscientiousness: +random().toFixed(2) };
    const agent = {
      id: `a${String(i + 1).padStart(4, '0')}`,
      name: `${FIRST_NAMES[i % 20]} ${LAST_NAMES[(i * 7 + Math.floor(i / 20)) % 20]}`,
      age: 18 + Math.floor(random() * 58), traits, goals: [goals[Math.floor(random() * goals.length)]],
      money: +(80 + random() * 370).toFixed(2),
      needs: { food: +(0.45 + random() * .5).toFixed(2), energy: +(0.45 + random() * .5).toFixed(2), belonging: +(0.4 + random() * .5).toFixed(2), clothes: +(0.55 + random() * .4).toFixed(2), health: +(0.78 + random() * .22).toFixed(2), stress: +(random() * .25).toFixed(2) },
      job: null, home: null, education: ['básica','media','superior'][Math.floor(random() * 3)]
    };
    agent.brain = createBrain(agent.id, traits);
    world.agents.push(agent);
  }
  const adults = world.agents.filter(agent => agent.age >= 18);
  let adultIndex = 0;
  for (const firm of world.firms) {
    const places = Math.max(1, Math.floor(adults.length / world.firms.length));
    for (let count = 0; count < places && adultIndex < adults.length; count++) {
      const agent = adults[adultIndex++]; firm.employees.push(agent.id); agent.job = firm.id;
    }
  }
  const homes = world.buildings.filter(building => building.kind === 'housing');
  for (let i = 0; i < world.agents.length; i++) {
    const home = homes[i % homes.length]; world.agents[i].home = home.id; home.occupants++;
  }
  for (let i = 0; i < world.agents.length; i++) {
    for (const j of [i + 1, i + 2]) if (j < world.agents.length && random() < .16) {
      world.relationships.push({ a: world.agents[i].id, b: world.agents[j].id,
        score: +(0.25 + random() * .55).toFixed(2), kind: ['amistad','familia','vecindad'][Math.floor(random() * 3)] });
    }
  }
  addEvent(world, 'city', `Nexus City nace con ${population} habitantes. Cada persona tiene una mente individual.`);
  snapshot(world);
  return world;
}
function migrateCity(world) {
  world.schema = 4;
  world.treasury ??= 0; world.tax_rate ??= .08; world.day ??= 0; world.policy ??= 'Servicios públicos'; world.next_election ??= world.day + 365;
  world.treasury = Number.isFinite(world.treasury) ? world.treasury : 0;
  world.rng ??= 42;
  world.events ??= []; world.history ??= []; world.relationships ??= []; world.buildings ??= []; world.firms ??= [];
  world.prices = { ...GOODS, ...(world.prices || {}) };
  for (const firm of world.firms) {
    firm.employees ??= []; firm.active ??= true; firm.inventory ??= 0; firm.cash ??= 500;
    firm.building ??= world.buildings.find(building => ['market','industry'].includes(building.kind))?.id ?? world.buildings[0]?.id;
    firm.price ??= world.prices[firm.good] ?? GOODS[firm.good] ?? 1;
  }
  const occupancyByHome = new Map();
  for (const agent of world.agents) {
    agent.needs ??= { food: .5, energy: .5, belonging: .5 };
    Object.assign(agent.needs, { clothes: .65, health: .9, stress: .1 }, agent.needs);
    agent.traits ??= {};
    Object.assign(agent.traits, { sociability:.5, ambition:.5, frugality:.5, curiosity:.5, kindness:.5, conscientiousness:.5 }, agent.traits);
    agent.brain ??= createBrain(agent.id, agent.traits);
    agent.brain.preferences ??= {};
    Object.assign(agent.brain.preferences, { risk: .5, saving: .5, sociability: agent.traits.sociability, generosity: agent.traits.kindness, curiosity: agent.traits.curiosity }, agent.brain.preferences);
    agent.brain.action_values ??= {}; agent.brain.action_counts ??= {}; agent.brain.procedural ??= {};
    Object.assign(agent.brain.procedural, { work_search: .15, budgeting: .1, social_cooperation: .1, learning: .1, self_care: .1 }, agent.brain.procedural);
    agent.brain.semantic ??= {};
    for (const [key, text] of Object.entries({ employment:'Puedes buscar empleo en empresas de la ciudad.', food_market:'Los mercados venden alimentos a cambio de dinero.', money:'El dinero permite intercambiar bienes y servicios.', social:'Hablar con vecinos puede fortalecer relaciones.', needs:'Conviene atender tus necesidades.', civic:'La alcaldía administra servicios públicos.' })) agent.brain.semantic[key] ??= { text, source:'initial', confidence:1, verified:true, uses:0 };
    agent.brain.episodic = Array.isArray(agent.brain.episodic) ? agent.brain.episodic : []; agent.brain.decisions = Array.isArray(agent.brain.decisions) ? agent.brain.decisions : []; agent.brain.learning ??= 0; agent.brain.seed ??= agent.id.length * 97;
    agent.goals ??= ['prosperar']; agent.money ??= 0; agent.education ??= 'básica'; agent.age ??= 25;
    agent.brain.education_progress = Number.isFinite(agent.brain.education_progress) ? agent.brain.education_progress : 0;
    if (!cityBuildingExists(world, agent.home)) {
      const home = world.buildings.find(building => building.kind === 'housing');
      if (home) agent.home = home.id;
    }
    if (agent.home) occupancyByHome.set(agent.home, (occupancyByHome.get(agent.home) || 0) + 1);
  }
  for (const building of world.buildings) if (building.kind === 'housing') building.occupants = occupancyByHome.get(building.id) || 0;
  return world;
}
function cityBuildingExists(world, id) { return world.buildings.some(building => building.id === id); }
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved?.agents?.length) { city = migrateCity(saved); return; }
  } catch (error) { console.warn('Partida guardada inválida; se inicia una ciudad nueva.', error); }
  city = createCity(); save();
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(city)); }
  catch (error) { console.error('No se pudo guardar la partida local.', error); }
}
function record(world, category, text) { addEvent(world, category, text); }
function snapshot(world = city) {
  const population = Math.max(1, world.agents.length);
  const employed = world.agents.filter(agent => agent.job).length;
  const wellbeing = world.agents.reduce((sum, agent) => sum + (agent.needs.food + agent.needs.energy + agent.needs.belonging + (agent.needs.clothes ?? .65) + (agent.needs.health ?? .9) + (1 - (agent.needs.stress ?? .1))) / 6, 0) / population;
  world.history.push({ day: world.day, prices: { ...world.prices }, wellbeing, employment: employed / population });
  if (world.history.length > 180) world.history.shift();
}
