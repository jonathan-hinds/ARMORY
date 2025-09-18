class Item {
  constructor({
    id,
    name,
    slot,
    type,
    category,
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
    useTrigger = null,
    useEffect = null,
    useConsumed = false,
    useDuration = null,
    reactiveEffects = [],
  }) {
    this.id = id;
    this.name = name;
    this.slot = slot; // weapon, helmet, chest, legs, feet, hands
    this.type = type; // weapon subtype or armor category
    this.category = category; // e.g. Potion, Scroll, Tool
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
    this.useTrigger = useTrigger;
    this.useEffect = useEffect;
    this.useConsumed = useConsumed;
    this.useDuration = useDuration;
    this.reactiveEffects = reactiveEffects;
  }
}

module.exports = Item;
