const { compute } = require('./derivedStats');
const { getAction } = require('./rotationEngine');
const { applyEffect, tick } = require('./effectsEngine');

function createCombatant(character) {
  const derived = compute(character);
  return {
    character,
    derived,
    health: derived.health,
    mana: derived.mana,
    stamina: derived.stamina,
    rotationIndex: 0,
    cooldowns: {},
    damageBuff: 0,
    buffs: [],
    dots: [],
    stunnedUntil: 0,
  };
}

async function runCombat(charA, charB, abilityMap) {
  const a = createCombatant(charA);
  const b = createCombatant(charB);
  const nextTimes = [0, 0];
  const combatants = [a, b];
  const log = [];
  let now = 0;
  while (a.health > 0 && b.health > 0) {
    const idx = nextTimes[0] <= nextTimes[1] ? 0 : 1;
    const actor = combatants[idx];
    const target = combatants[1 - idx];
    now = nextTimes[idx];
    tick(actor, now, log);
    tick(target, now, log);
    if (actor.stunnedUntil > now) {
      log.push(`${actor.character.name} is stunned and misses the turn`);
    } else {
      const action = getAction(actor, now, abilityMap);
      if (action.type === 'ability') {
        log.push(`${actor.character.name} uses ${action.ability.name}`);
        action.ability.effects.forEach(e => applyEffect(actor, target, e, now, log));
      } else {
        const effect =
          actor.character.basicType === 'melee'
            ? { type: 'PhysicalDamage', value: 0 }
            : { type: 'MagicDamage', value: 0 };
        applyEffect(actor, target, effect, now, log);
      }
    }
    nextTimes[idx] += actor.derived.attackIntervalSeconds;
    const next = Math.min(nextTimes[0], nextTimes[1]);
    const wait = Math.max(0, next - now);
    if (a.health > 0 && b.health > 0) {
      // wait in real time until the next scheduled action
      await new Promise(res => setTimeout(res, wait * 1000));
    }
  }
  const winner = a.health > 0 ? a : b;
  return { winnerId: winner.character.id, log };
}

module.exports = { runCombat };
