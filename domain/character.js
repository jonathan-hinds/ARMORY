class Character {
  constructor({
    id,
    playerId,
    attributes,
    basicType,
    level = 1,
    xp = 0,
    rotation = [],
    equipment = {},
  }) {
    this.id = id;
    this.playerId = playerId;
    this.attributes = attributes; // {strength, stamina, agility, intellect, wisdom}
    this.basicType = basicType; // 'melee' or 'magic'
    this.level = level;
    this.xp = xp;
    this.rotation = rotation;
    this.equipment = equipment; // {weapon:null, helmet:null, chest:null, legs:null, feet:null, hands:null}
  }
}

module.exports = Character;
