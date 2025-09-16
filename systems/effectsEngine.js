const { pushLog } = require('./log');

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function applyDamage(source, target, amount, type, log) {
  const resist = type === 'physical' ? target.derived.meleeResist : target.derived.magicResist;
  let dmg = amount * (1 + source.damageBuff);
  dmg = Math.max(1, Math.round(dmg * (1 - resist)));
  target.health -= dmg;
  pushLog(log, `${source.character.name} hits ${target.character.name} for ${dmg} ${type}`, {
    sourceId: source.character.id,
    targetId: target.character.id,
    kind: 'damage',
    damageType: type,
    amount: dmg,
  });
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
      const healed = source.health - before;
      pushLog(log, `${source.character.name} heals ${healed}`, {
        sourceId: source.character.id,
        targetId: source.character.id,
        kind: 'heal',
        amount: healed,
      });
      break;
    }
    case 'BuffDamagePct': {
      source.damageBuff += effect.amount;
      source.buffs.push({ amount: effect.amount, expires: now + effect.duration });
      pushLog(log, `${source.character.name} gains +${Math.round(effect.amount * 100)}% damage`, {
        sourceId: source.character.id,
        targetId: source.character.id,
        kind: 'buff',
        amount: effect.amount,
        duration: effect.duration,
      });
      break;
    }
    case 'Stun': {
      target.stunnedUntil = Math.max(target.stunnedUntil, now + effect.duration);
      pushLog(log, `${target.character.name} is stunned`, {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'stun',
        duration: effect.duration,
      });
      break;
    }
    case 'Poison': {
      target.dots.push({
        damage: effect.damage,
        interval: effect.interval,
        nextTick: now + effect.interval,
        expires: now + effect.duration,
      });
      pushLog(log, `${target.character.name} is poisoned`, {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'poison',
        interval: effect.interval,
        duration: effect.duration,
        damage: effect.damage,
      });
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
      pushLog(log, `${combatant.character.name}'s buff fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
        amount: b.amount,
      });
      return false;
    }
    return true;
  });
  combatant.dots = combatant.dots.filter(d => {
    while (now >= d.nextTick && now < d.expires) {
      const dmg = Math.max(1, Math.round(d.damage * (1 - combatant.derived.meleeResist)));
      combatant.health -= dmg;
      pushLog(log, `${combatant.character.name} takes ${dmg} poison damage`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'damage',
        damageType: 'poison',
        amount: dmg,
      });
      d.nextTick += d.interval;
    }
    return now < d.expires;
  });
}

module.exports = { applyEffect, tick };
