class Player {
  constructor({ id, name, password, gold = 0, itemIds = [] }) {
    this.id = id;
    this.name = name;
    this.password = password;
    this.gold = gold;
    this.itemIds = itemIds;
  }
}

module.exports = Player;
