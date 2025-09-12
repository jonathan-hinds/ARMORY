function applyEffect(effect, source, target, now) {
  const dmgMult = 1 + source.damageBuffs.reduce((s, b) => s + b.amount, 0);
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
    case 'BuffDamagePct': {
      source.damageBuffs.push({ amount: effect.potency, expires: now + effect.duration });
      return `${source.name}'s damage increases by ${(effect.potency * 100).toFixed(0)}% for ${effect.duration}s.`;
    }
    case 'Stun': {
      target.stunnedUntil = Math.max(target.stunnedUntil, now + effect.duration);
      return `${target.name} is stunned for ${effect.duration}s.`;
    }
    case 'Poison': {
      target.poisons.push({ potency: effect.potency, tick: effect.tick, nextTick: now + effect.tick, expires: now + effect.duration });
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
