// Individual memory, bounded learning, personality-weighted choices and social reliability.
function remember(agent, event, kind = 'experience', importance = .5) {
  const memory = agent.brain.episodic;
  memory.push({ day: city.day, event: String(event).slice(0, 150), kind, importance: +importance.toFixed(2) });
  if (memory.length > 40) {
    memory.sort((a, b) => b.importance - a.importance || b.day - a.day);
    memory.length = 40;
    memory.sort((a, b) => a.day - b.day);
  }
}
function learn(agent, action, reward, fact = null) {
  const brain = agent.brain, count = brain.action_counts[action] || 0, oldValue = brain.action_values[action] || 0;
  brain.action_values[action] = +(oldValue + (reward - oldValue) / (count + 1)).toFixed(4);
  brain.action_counts[action] = count + 1;
  const skill = { buy_food: 'budgeting', buy_energy: 'budgeting', buy_clothes: 'budgeting', shop: 'budgeting', seek_work: 'work_search', socialize: 'social_cooperation', help_neighbor: 'social_cooperation', study: 'learning', rest: 'self_care' }[action] || action;
  const oldSkill = brain.procedural[skill] || .05;
  brain.procedural[skill] = +Math.min(1, Math.max(.01, oldSkill + (reward > 0 ? Math.max(.005, reward * .06) : -Math.max(.003, oldSkill * .12)))).toFixed(3);
  brain.learning++;
  if (fact && (!brain.semantic[fact.key] || !brain.semantic[fact.key].verified)) {
    brain.semantic[fact.key] = { text: fact.text, source: 'learned', confidence: +Math.min(1, .55 + Math.abs(reward) * .4).toFixed(2), verified: reward >= .25, uses: 0 };
  }
  remember(agent, `La acción ${action} tuvo resultado ${reward >= 0 ? '+' : ''}${reward.toFixed(2)}.`, 'outcome', Math.abs(reward));
}
function decide(agent, options) {
  const brain = agent.brain, scores = {}, needs = agent.needs, traits = agent.traits;
  const requiredFacts = { buy_food: 'food_market', buy_energy: 'money', buy_clothes: 'money', seek_work: 'employment', socialize: 'social', help_neighbor: 'social' };
  for (const action of options) {
    const required = requiredFacts[action];
    if (required && !brain.semantic[required]) continue;
    let score = (brain.action_values[action] || 0) * .7;
    const goals = agent.goals || [];
    const goalBoost = { prosperar: { seek_work: .16, save_money: .1 }, 'formar comunidad': { socialize: .22, help_neighbor: .2 }, aprender: { study: .3 }, ahorrar: { save_money: .24, buy_clothes: -.05 }, emprender: { seek_work: .18, study: .08 } };
    for (const goal of goals) score += goalBoost[goal]?.[action] || 0;
    score += (traits.curiosity || .5) * (action === 'study' ? .12 : 0) + (traits.kindness || .5) * (action === 'help_neighbor' ? .12 : 0);
    if (action === 'buy_food') score += (1 - needs.food) * (1.35 + (1 - needs.health) * .35) - brain.preferences.saving * .12 + brain.procedural.budgeting * .16;
    if (action === 'buy_energy') score += (1 - needs.energy) * .95 - brain.preferences.saving * .1 + brain.procedural.budgeting * .12;
    if (action === 'buy_clothes') score += (1 - needs.clothes) * (1.05 + traits.conscientiousness * .3) - brain.preferences.saving * .1 + brain.procedural.budgeting * .08;
    if (action === 'seek_work') score += (!agent.job ? .48 : 0) + traits.ambition * .2 + brain.procedural.work_search * .18 + (agent.money < 35 ? .22 : 0);
    if (action === 'socialize') score += (1 - needs.belonging) * (.8 + traits.sociability * .35) + brain.procedural.social_cooperation * .1 + socialBond(agent) * .12;
    if (action === 'help_neighbor') score += traits.kindness * .48 + (1 - needs.belonging) * .2 + socialBond(agent) * .08;
    if (action === 'save_money') score += brain.preferences.saving * .46 + agent.money / 1000 * .08;
    if (action === 'study') score += .18 + traits.curiosity * .5 + brain.procedural.learning * .18;
    if (action === 'rest') score += needs.stress * .62 + (1 - needs.energy) * .42;
    scores[action] = +score.toFixed(4);
  }
  const actions = Object.keys(scores);
  if (!actions.length) return null;
  actions.sort((a, b) => scores[b] - scores[a] || a.localeCompare(b));
  const action = actions[0];
  const reasons = { buy_food: 'hambre, salud y aprendizaje del mercado', buy_energy: 'necesidad de energía y recursos', buy_clothes: 'comodidad, cuidado personal y presupuesto', seek_work: 'meta económica, personalidad y experiencia laboral', socialize: 'pertenencia, confianza y sociabilidad', help_neighbor: 'empatía y apoyo comunitario', save_money: 'preferencia personal de ahorro', study: 'curiosidad y habilidad de aprendizaje', rest: 'fatiga y estrés acumulado' };
  const decision = { day: city.day, action, reason: reasons[action] || 'mayor utilidad personal', scores };
  brain.decisions.push(decision);
  if (brain.decisions.length > 20) brain.decisions.shift();
  return decision;
}
let bondCacheDay = -1, bondCacheCity = null, bondCache = new Map();
function socialBond(agent) {
  if (!city?.relationships) return 0;
  if (bondCacheCity !== city || bondCacheDay !== city.day) {
    bondCacheCity = city; bondCacheDay = city.day; bondCache = new Map();
    for (const relation of city.relationships) {
      for (const id of [relation.a, relation.b]) { const item = bondCache.get(id) || { sum:0, count:0 }; item.sum += relation.score; item.count++; bondCache.set(id,item); }
    }
  }
  const item = bondCache.get(agent.id); return item ? item.sum / item.count : 0;
}
function teachSkill(teacher, learner, skill) {
  const value = teacher.brain.procedural[skill] || 0;
  if (value < .2) return false;
  learner.brain.procedural[skill] = +Math.min(1, Math.max(learner.brain.procedural[skill] || 0, value * .55)).toFixed(3);
  learner.brain.semantic[`skill:${skill}`] = { text: `Se puede aplicar la habilidad ${skill}.`, source: 'social', source_agent: teacher.id, confidence: .62, verified: false, uses: 0 };
  remember(teacher, `Enseñó ${skill} a ${learner.name}.`, 'teaching', .55);
  remember(learner, `${teacher.name} le enseñó ${skill}.`, 'lesson', .65);
  record(city, 'learning', `${teacher.name} enseñó ${skill} a ${learner.name}.`);
  return true;
}
function verifyKnowledge(agent, key, evidence, supports = true) {
  const fact = agent.brain.semantic[key];
  if (!fact) return false;
  const field = supports ? 'supporting_reports' : 'contradicting_reports';
  fact[field] = (fact[field] || 0) + 1;
  if (fact[field] >= 2) {
    fact.verified = Boolean(supports); fact.status = supports ? 'verified' : 'refuted'; fact.confidence = .85;
    remember(agent, `Evaluó ${key}: ${evidence}`, supports ? 'verification' : 'contradiction', .85);
  }
  return Boolean(fact.verified);
}
