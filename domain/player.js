class Player {
  constructor({ id, name, gold = 0, items = [], characterId = null }) {
    this.id = id;
    this.name = name;
    this.gold = gold;
    this.items = items;
    this.characterId = characterId;
  }
}

module.exports = Player;
