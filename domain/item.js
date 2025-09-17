class Item {
  constructor({
    id,
    name,
    slot,
    type,
    rarity,
    cost = 0,
    damageType = null,
    baseDamage = null,
    scaling = {},
    attributeBonuses = {},
    resourceBonuses = {},
    resistances = {},
    onHitEffects = [],
    attackIntervalModifier = 0,
    chanceBonuses = {},
  }) {
    this.id = id;
    this.name = name;
    this.slot = slot; // weapon, helmet, chest, legs, feet, hands
    this.type = type; // weapon subtype or armor category
    this.rarity = rarity; // Common, Uncommon, Rare, Epic, Legendary
    this.cost = cost;
    this.damageType = damageType; // physical or magical (for weapons)
    this.baseDamage = baseDamage;
    this.scaling = scaling;
    this.attributeBonuses = attributeBonuses;
    this.resourceBonuses = resourceBonuses;
    this.resistances = resistances;
    this.onHitEffects = onHitEffects;
    this.attackIntervalModifier = attackIntervalModifier;
    this.chanceBonuses = chanceBonuses;
  }
}

module.exports = Item;
