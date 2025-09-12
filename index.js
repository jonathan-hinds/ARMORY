const { loadAbilities, loadItems } = require('./systems/catalogLoader');
const { computeDerived } = require('./systems/derivedStats');
const { runCombat } = require('./systems/combatEngine');
const Matchmaking = require('./systems/matchmaking');
const Character = require('./domain/Character');

function randomAttributes(points) {
  const stats = { strength:0, stamina:0, agility:0, intellect:0, wisdom:0 };
  const keys = Object.keys(stats);
  for (let i=0;i<points;i++) {
    const k = keys[Math.floor(Math.random()*keys.length)];
    stats[k]++;
  }
  return stats;
}

async function main() {
  const abilities = await loadAbilities();
  const items = await loadItems();

  const charA = new Character({ id:'a', playerId:'p1', name:'Hero', basicType:'melee', attributes: randomAttributes(15), rotation:['slash','heal','bash'] });
  const charB = new Character({ id:'b', playerId:'p2', name:'Mage', basicType:'magic', attributes: randomAttributes(15), rotation:['fireball','heal','smite'] });

  charA.derived = computeDerived(charA, items).derived;
  charB.derived = computeDerived(charB, items).derived;
  charA.resources = { health: charA.derived.healthMax, mana: charA.derived.manaMax, stamina: charA.derived.staminaMax };
  charB.resources = { health: charB.derived.healthMax, mana: charB.derived.manaMax, stamina: charB.derived.staminaMax };

  const mm = new Matchmaking(abilities);
  mm.enqueue(charA);
  const log = mm.enqueue(charB) || [];
  console.log(log.join('\n'));
}

main();
