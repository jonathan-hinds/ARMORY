class Item {
  constructor({ id, name, type, slot = null, baseMin = 0, baseMax = 0, scaling = {}, bonuses = {}, meleeResist = 0, magicResist = 0 }) {
    this.id = id;
    this.name = name;
    this.type = type; // weapon | armor
    this.slot = slot; // helmet, chest, legs, feet, hands for armor
    this.baseMin = baseMin;
    this.baseMax = baseMax;
    this.scaling = scaling; // {strength:'B', ...}
    this.bonuses = bonuses; // stat bonuses
    this.meleeResist = meleeResist;
    this.magicResist = magicResist;
  }
}

module.exports = Item;
