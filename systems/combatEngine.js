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

function state(c) {
  return {
    id: c.character.id,
    name: c.character.name,
    health: c.health,
    mana: c.mana,
    stamina: c.stamina,
    maxHealth: c.derived.health,
    maxMana: c.derived.mana,
    maxStamina: c.derived.stamina,
  };
}

async function runCombat(charA, charB, abilityMap, onUpdate) {
  const a = createCombatant(charA);
  const b = createCombatant(charB);
  const nextTimes = [0, 0];
  const combatants = [a, b];
  const log = [];
  let now = 0;
  if (onUpdate) onUpdate({ type: 'start', a: state(a), b: state(b), log: [] });
  while (a.health > 0 && b.health > 0) {
    const idx = nextTimes[0] <= nextTimes[1] ? 0 : 1;
    const actor = combatants[idx];
    const target = combatants[1 - idx];
    now = nextTimes[idx];
    const before = log.length;
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
        const basicLabel = actor.character.basicType === 'melee' ? 'melee' : 'magic';
        let message;
        if (action.reason === 'cooldown' && action.ability) {
          const remaining =
            typeof action.remainingCooldown === 'number'
              ? Math.max(0, action.remainingCooldown)
              : null;
          const remainingText =
            remaining !== null ? ` (${remaining.toFixed(1)}s remaining)` : '';
          message = `${action.ability.name} is on cooldown${remainingText}, so ${actor.character.name} performs a ${basicLabel} basic attack.`;
        } else if (action.reason === 'resource' && action.ability) {
          const available = typeof action.available === 'number' ? action.available : 0;
          message = `${actor.character.name} lacks ${action.resourceType} (${available}/${action.required}) for ${action.ability.name} and performs a ${basicLabel} basic attack.`;
        } else if (action.reason === 'missingAbility') {
          message = `${actor.character.name} cannot use unknown ability ${action.abilityId} and performs a ${basicLabel} basic attack.`;
        } else if (action.reason === 'noRotation') {
          message = `${actor.character.name} has no rotation ready and performs a ${basicLabel} basic attack.`;
        }

        log.push(message || `${actor.character.name} performs a ${basicLabel} basic attack.`);

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
    const newLogs = log.slice(before);
    if (onUpdate) onUpdate({ type: 'update', a: state(a), b: state(b), log: newLogs });
    if (a.health > 0 && b.health > 0) {
      // wait in real time until the next scheduled action
      await new Promise(res => setTimeout(res, wait * 1000));
    }
  }
  const winner = a.health > 0 ? a : b;
  return { winnerId: winner.character.id, log };
}

module.exports = { runCombat };
