class Stats {
  constructor({ strength = 0, stamina = 0, agility = 0, intellect = 0, wisdom = 0 } = {}) {
    this.strength = strength;
    this.stamina = stamina;
    this.agility = agility;
    this.intellect = intellect;
    this.wisdom = wisdom;
  }
}

module.exports = Stats;
