const { takeAction } = require('./rotationEngine');
const { applyEffects } = require('./effectsEngine');

function getBuffMult(char, stat) {
  return 1 + char.statuses
    .filter(s => s.type === 'buff' && s.stat === stat)
    .reduce((sum, s) => sum + s.amount, 0);
}

function tickStatuses(char, now, log) {
  char.statuses = char.statuses.filter(s => {
    if (s.type === 'buff') {
      if (s.expires > now) return true;
      log.push(`${char.name}'s ${s.stat} buff fades.`);
      return false;
    }
    if (s.type === 'poison') {
      while (s.nextTick <= now && s.nextTick <= s.expires) {
        const dmg = Math.max(1, s.potency * (1 - char.derived.magicResist));
        char.resources.health -= dmg;
        log.push(`${char.name} suffers ${dmg.toFixed(0)} poison.`);
        s.nextTick += s.tick;
      }
      return s.expires > now;
    }
    if (s.type === 'stun') {
      if (s.expires > now) return true;
      log.push(`${char.name} is no longer stunned.`);
      return false;
    }
    return s.expires > now;
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

    if (actor.statuses.some(s => s.type === 'stun' && s.expires > now)) {
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
      const dmgMult = getBuffMult(actor, 'damage');
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
