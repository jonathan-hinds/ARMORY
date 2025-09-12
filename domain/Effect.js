class Effect {
  constructor({ type, potency = 0, duration = 0, tick = 0 }) {
    this.type = type; // PhysicalDamage, MagicDamage, Heal, BuffDamagePct, Stun, Poison
    this.potency = potency;
    this.duration = duration; // seconds
    this.tick = tick; // for DoT/Poison
  }
}

module.exports = Effect;
