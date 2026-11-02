const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function makeContext() {
  const storage = new Map();
  const context = vm.createContext({
    console, Math, Map, Set, Object, Array, String, Number, Boolean, JSON, Date, Float32Array,
    globalThis: null,
    localStorage: { getItem:key=>storage.get(key)??null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key) },
    window:{devicePixelRatio:1,addEventListener(){}}, document:{addEventListener(){},hidden:false},
    requestAnimationFrame(){},setInterval,clearInterval,confirm:()=>true,alert(){}
  });
  context.globalThis=context;
  for(const file of ['core.js','learning.js','simulation.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',file),'utf8'),context,{filename:file});
  vm.runInContext('this.__getCity = () => city; this.__setCity = value => { city = value; }; this.__getGoods = () => GOODS; this.__getSaveKey = () => SAVE_KEY; this.render = () => {}; this.save = () => {};',context);
  return {context,storage};
}

test('same seed creates the same populated city and unique, bounded individual brains',()=>{
 const {context}=makeContext(),a=context.createCity(40,123),b=context.createCity(40,123);
 assert.equal(a.agents.length,40);assert.equal(new Set(a.agents.map(x=>x.id)).size,40);
 assert.equal(a.agents[0].name,b.agents[0].name);assert.equal(a.agents[0].brain.seed,b.agents[0].brain.seed);
 assert.equal(Object.keys(a.agents[0].brain.semantic).length,6);assert.equal(a.agents[0].brain.episodic.length,0);
});
test('repeated economic failures change the next autonomous decision',()=>{
 const {context}=makeContext(),world=context.createCity(10,7);context.__setCity(world);const a=world.agents[0];
 a.traits.ambition=0;a.brain.preferences.saving=.15;a.needs.food=.9;a.needs.belonging=.9;
 assert.equal(context.decide(a,['seek_work','save_money']).action,'seek_work');
 for(let i=0;i<4;i++)context.learn(a,'seek_work',-1);
 assert.equal(context.decide(a,['seek_work','save_money']).action,'save_money');
});
test('learned knowledge is attributable and experience affects action value',()=>{
 const {context}=makeContext(),world=context.createCity(8,19);context.__setCity(world);const a=world.agents[0];
 context.learn(a,'buy_food',.8,{key:'market:food',text:'Food price learned.'});
 assert.equal(a.brain.semantic['market:food'].source,'learned');assert.equal(a.brain.semantic['market:food'].verified,true);
 assert.equal(a.brain.action_counts.buy_food,1);assert.equal(a.brain.learning,1);
});
test('old saved cities migrate without losing residents or initialize their brains',()=>{
 const {context,storage}=makeContext(),old=context.createCity(5,3);delete old.schema;for(const a of old.agents)delete a.brain;
 storage.set(context.__getSaveKey(),JSON.stringify(old));context.load();const migrated=context.__getCity();
 assert.equal(migrated.agents.length,5);assert.ok(migrated.agents.every(a=>a.brain&&a.brain.semantic.employment));
});
test('daily simulation remains deterministic, bounded and records its calendar',()=>{
 const {context}=makeContext(),world=context.createCity(60,8);context.__setCity(world);context.tick(8);const result=context.__getCity();
 assert.equal(result.day,8);assert.ok(result.history.length>=2);
 assert.ok(Object.entries(result.prices).every(([good,price])=>price>=context.__getGoods()[good]*.35&&price<=context.__getGoods()[good]*3));
 assert.ok(result.events.some(event=>event.day===7));
});
test('skills transfer to a learner and must be mastered by the teacher',()=>{
 const {context}=makeContext(),world=context.createCity(4,9);context.__setCity(world);const [teacher,learner]=world.agents;
 teacher.brain.procedural.budgeting=.9;assert.equal(context.teachSkill(teacher,learner,'budgeting'),true);
 assert.ok(learner.brain.procedural.budgeting>=.49);assert.equal(learner.brain.semantic['skill:budgeting'].source,'social');
 assert.equal(context.teachSkill(learner,teacher,'unknown'),false);
});
