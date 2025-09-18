class Character {
  constructor({
    id,
    playerId,
    name,
    attributes,
    basicType,
    level = 1,
    xp = 0,
    rotation = [],
    equipment = {},
    gold = 0,
    items = [],
  }) {
    this.id = id;
    this.playerId = playerId;
    this.name = name;
    this.attributes = attributes; // {strength, stamina, agility, intellect, wisdom}
    this.basicType = basicType; // 'melee' or 'magic'
    this.level = level;
    this.xp = xp;
    this.rotation = rotation;
    this.equipment = equipment; // {weapon:null, helmet:null, chest:null, legs:null, feet:null, hands:null}
    this.gold = gold;
    this.items = items;
  }
}

module.exports = Character;
