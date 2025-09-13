class Effect {
  constructor({ type, ...params }) {
    this.type = type; // e.g., 'PhysicalDamage', 'Heal', etc.
    Object.assign(this, params);
  }
}

module.exports = Effect;
