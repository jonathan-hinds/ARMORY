const { takeAction } = require('./rotationEngine');
const { applyEffects } = require('./effectsEngine');

function tickStatuses(char, now, log) {
  char.damageBuffs = char.damageBuffs.filter(buff => {
    if (buff.expires > now) return true;
    log.push(`${char.name}'s damage buff fades.`);
    return false;
  });
  char.poisons = char.poisons.filter(p => {
    while (p.nextTick <= now && p.nextTick <= p.expires) {
      const dmg = Math.max(1, p.potency * (1 - char.derived.magicResist));
      char.resources.health -= dmg;
      log.push(`${char.name} suffers ${dmg.toFixed(0)} poison.`);
      p.nextTick += p.tick;
    }
    return p.expires > now;
  });
}

function runCombat(a, b, abilities) {
  a.nextActionTime = 0;
  b.nextActionTime = 0;
  let log = [];
  while (a.resources.health > 0 && b.resources.health > 0) {
    const actor = a.nextActionTime <= b.nextActionTime ? a : b;
    const target = actor === a ? b : a;
    const now = actor.nextActionTime;

    tickStatuses(actor, now, log);
    tickStatuses(target, now, log);
    if (actor.resources.health <= 0 || target.resources.health <= 0) break;

    if (actor.stunnedUntil > now) {
      log.push(`${actor.name} is stunned and misses the turn.`);
      actor.nextActionTime += actor.derived.attackIntervalSeconds;
      continue;
    }

    const decision = takeAction(actor, now, abilities);
    if (decision.type === 'ability') {
      log.push(...applyEffects(decision.ability.effects, actor, target, now));
    } else {
      // basic attack
      const base = actor.basicType === 'melee' ? actor.derived.minMeleeAttack : actor.derived.minMagicAttack;
      const dmgMult = 1 + actor.damageBuffs.reduce((s, b) => s + b.amount, 0);
      const resist = actor.basicType === 'melee' ? target.derived.meleeResist : target.derived.magicResist;
      const final = Math.max(1, base * dmgMult * (1 - resist));
      target.resources.health -= final;
      log.push(`${actor.name} basic attacks ${target.name} for ${final.toFixed(0)}.`);
    }
    actor.nextActionTime += actor.derived.attackIntervalSeconds;
    if (log.length > 1000) break; // safety
  }
  log.push(a.resources.health <= 0 ? `${b.name} wins!` : `${a.name} wins!`);
  return log;
}

module.exports = { runCombat };
