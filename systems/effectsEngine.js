function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function applyDamage(source, target, amount, type, log) {
  const resist = type === 'physical' ? target.derived.meleeResist : target.derived.magicResist;
  let dmg = amount * (1 + source.damageBuff);
  dmg = Math.max(1, Math.round(dmg * (1 - resist)));
  target.health -= dmg;
  log.push(`${source.character.name} hits ${target.character.name} for ${dmg} ${type}`);
}

function applyEffect(source, target, effect, now, log) {
  switch (effect.type) {
    case 'PhysicalDamage': {
      const base = effect.value + randBetween(source.derived.minMeleeAttack, source.derived.maxMeleeAttack);
      applyDamage(source, target, base, 'physical', log);
      break;
    }
    case 'MagicDamage': {
      const base = effect.value + randBetween(source.derived.minMagicAttack, source.derived.maxMagicAttack);
      applyDamage(source, target, base, 'magical', log);
      break;
    }
    case 'Heal': {
      const amount = effect.value;
      const before = source.health;
      source.health = Math.min(source.health + amount, source.derived.health);
      log.push(`${source.character.name} heals ${source.health - before}`);
      break;
    }
    case 'BuffDamagePct': {
      source.damageBuff += effect.amount;
      source.buffs.push({ amount: effect.amount, expires: now + effect.duration });
      log.push(`${source.character.name} gains +${Math.round(effect.amount * 100)}% damage`);
      break;
    }
    case 'Stun': {
      target.stunnedUntil = Math.max(target.stunnedUntil, now + effect.duration);
      log.push(`${target.character.name} is stunned`);
      break;
    }
    case 'Poison': {
      target.dots.push({
        damage: effect.damage,
        interval: effect.interval,
        nextTick: now + effect.interval,
        expires: now + effect.duration,
      });
      log.push(`${target.character.name} is poisoned`);
      break;
    }
    default:
      break;
  }
}

function tick(combatant, now, log) {
  combatant.buffs = combatant.buffs.filter(b => {
    if (now >= b.expires) {
      combatant.damageBuff -= b.amount;
      log.push(`${combatant.character.name}'s buff fades`);
      return false;
    }
    return true;
  });
  combatant.dots = combatant.dots.filter(d => {
    while (now >= d.nextTick && now < d.expires) {
      const dmg = Math.max(1, Math.round(d.damage * (1 - combatant.derived.meleeResist)));
      combatant.health -= dmg;
      log.push(`${combatant.character.name} takes ${dmg} poison damage`);
      d.nextTick += d.interval;
    }
    return now < d.expires;
  });
}

module.exports = { applyEffect, tick };
