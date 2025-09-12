class Effect {
  constructor({ type, potency = 0, duration = 0, tick = 0, stat = null }) {
    this.type = type; // PhysicalDamage, MagicDamage, Heal, BuffStatPct, Stun, Poison
    this.potency = potency;
    this.duration = duration; // seconds
    this.tick = tick; // for DoT/Poison
    this.stat = stat; // targeted stat for buffs
  }
}

module.exports = Effect;
