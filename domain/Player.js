class Player {
  constructor({ id, name, gold = 0, itemIds = [] }) {
    this.id = id;
    this.name = name;
    this.gold = gold;
    this.itemIds = itemIds;
  }
}

module.exports = Player;
