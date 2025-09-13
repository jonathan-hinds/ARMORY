class Ability {
  constructor({ id, name, school, costType, costValue, cooldown, scaling = [], effects = [] }) {
    this.id = id;
    this.name = name;
    this.school = school; // 'physical' or 'magical'
    this.costType = costType; // 'stamina' or 'mana'
    this.costValue = costValue;
    this.cooldown = cooldown; // seconds
    this.scaling = scaling; // array of stat names
    this.effects = effects; // array of Effect descriptors
  }
}

module.exports = Ability;
