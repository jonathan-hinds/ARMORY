const Stats = require('./Stats');

class Character {
  constructor({ id, playerId, name, basicType, attributes = {}, rotation = [], equipment = {}, level = 1, xp = 0, unspent = 0 }) {
    this.id = id;
    this.playerId = playerId;
    this.name = name;
    this.basicType = basicType; // melee | magic
    this.attributes = new Stats(attributes);
    this.rotation = rotation; // array of ability ids
    this.equipment = equipment; // {weapon:null, helmet:null,...}
    this.level = level;
    this.xp = xp;
    this.unspent = unspent;
    this.cooldowns = {}; // abilityId: readyTime
    this.resources = { health: 0, mana: 0, stamina: 0 };
    this.derived = {};
    this.rotationIndex = 0;
    this.stunnedUntil = 0;
    this.damageBuffs = []; // {amount, expires}
    this.poisons = []; // {potency, tick, nextTick, expires}
  }
}

module.exports = Character;
