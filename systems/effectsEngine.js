function getBuffMult(char, stat) {
  return 1 + char.statuses
    .filter(s => s.type === 'buff' && s.stat === stat)
    .reduce((sum, s) => sum + s.amount, 0);
}

function applyEffect(effect, source, target, now) {
  const dmgMult = getBuffMult(source, 'damage');
  switch (effect.type) {
    case 'PhysicalDamage': {
      const base = effect.potency * dmgMult;
      const dmg = Math.max(1, base * (1 - target.derived.meleeResist));
      target.resources.health -= dmg;
      return `${source.name} hits ${target.name} for ${dmg.toFixed(0)} physical.`;
    }
    case 'MagicDamage': {
      const base = effect.potency * dmgMult;
      const dmg = Math.max(1, base * (1 - target.derived.magicResist));
      target.resources.health -= dmg;
      return `${source.name} hits ${target.name} for ${dmg.toFixed(0)} magic.`;
    }
    case 'Heal': {
      const before = target.resources.health;
      target.resources.health = Math.min(target.resources.health + effect.potency, target.derived.healthMax);
      return `${source.name} heals ${target.name} for ${(target.resources.health - before).toFixed(0)}.`;
    }
    case 'BuffStatPct': {
      source.statuses.push({ type: 'buff', stat: effect.stat, amount: effect.potency, expires: now + effect.duration });
      return `${source.name}'s ${effect.stat} increases by ${(effect.potency * 100).toFixed(0)}% for ${effect.duration}s.`;
    }
    case 'Stun': {
      target.statuses.push({ type: 'stun', expires: now + effect.duration });
      return `${target.name} is stunned for ${effect.duration}s.`;
    }
    case 'Poison': {
      target.statuses.push({ type: 'poison', potency: effect.potency, tick: effect.tick, nextTick: now + effect.tick, expires: now + effect.duration });
      return `${target.name} is poisoned.`;
    }
    default:
      return `${source.name} does nothing.`;
  }
}

function applyEffects(effects, source, target, now) {
  return effects.map(e => applyEffect(e, source, target, now));
}

module.exports = { applyEffects };
