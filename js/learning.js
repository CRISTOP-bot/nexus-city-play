// Individual memory, bounded learning, action ranking and social reliability.
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
  const brain = agent.brain;
  const count = brain.action_counts[action] || 0;
  const oldValue = brain.action_values[action] || 0;
  brain.action_values[action] = +(oldValue + (reward - oldValue) / (count + 1)).toFixed(4);
  brain.action_counts[action] = count + 1;
  const skill = { buy_food: 'budgeting', buy_energy: 'budgeting', shop: 'budgeting', seek_work: 'work_search', socialize: 'social_cooperation', study: 'learning' }[action] || action;
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
  const requiredFacts = { buy_food: 'food_market', buy_energy: 'money', seek_work: 'employment', socialize: 'social' };
  for (const action of options) {
    const required = requiredFacts[action];
    if (required && !brain.semantic[required]) continue;
    let score = (brain.action_values[action] || 0) * .65;
    if (action === 'buy_food') score += (1 - needs.food) * 1.15 - brain.preferences.saving * .12 + brain.procedural.budgeting * .12;
    if (action === 'buy_energy') score += (1 - needs.energy) * .85 - brain.preferences.saving * .1 + brain.procedural.budgeting * .1;
    if (action === 'seek_work') score += (!agent.job ? .5 : 0) + traits.ambition * .25 + brain.procedural.work_search * .15;
    if (action === 'socialize') score += (1 - needs.belonging) * .75 + traits.sociability * .3 + brain.procedural.social_cooperation * .1;
    if (action === 'save_money') score += brain.preferences.saving * .48 + agent.money / 1000 * .08;
    if (action === 'study') score += .24 + brain.procedural.learning * .15;
    scores[action] = +score.toFixed(4);
  }
  const actions = Object.keys(scores);
  if (!actions.length) return null;
  actions.sort((a, b) => scores[b] - scores[a] || a.localeCompare(b));
  const action = actions[0];
  const reasons = { buy_food: 'necesidad de alimento y conocimiento del mercado', buy_energy: 'necesidad de energía y recursos', seek_work: 'meta económica, personalidad y experiencia laboral', socialize: 'pertenencia y rasgo social', save_money: 'preferencia personal de ahorro', study: 'curiosidad y habilidad de aprendizaje' };
  const decision = { day: city.day, action, reason: reasons[action] || 'mayor utilidad personal', scores };
  brain.decisions.push(decision);
  if (brain.decisions.length > 20) brain.decisions.shift();
  return decision;
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
    fact.verified = Boolean(supports);
    fact.status = supports ? 'verified' : 'refuted';
    fact.confidence = .85;
    remember(agent, `Evaluó ${key}: ${evidence}`, supports ? 'verification' : 'contradiction', .85);
  }
  return Boolean(fact.verified);
}
