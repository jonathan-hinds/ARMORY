const Effect = require('./Effect');

class Ability {
  constructor({ id, name, school, costType, costValue, cooldown, scaling = [], effects = [] }) {
    this.id = id;
    this.name = name;
    this.school = school; // physical | magical
    this.costType = costType; // stamina | mana
    this.costValue = costValue;
    this.cooldown = cooldown; // seconds
    this.scaling = scaling; // array of stats names affecting damage
    this.effects = effects.map(e => new Effect(e));
  }
}

module.exports = Ability;
