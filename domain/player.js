class Player {
  constructor({ id, name, characterId = null }) {
    this.id = id;
    this.name = name;
    this.characterId = characterId;
  }
}

module.exports = Player;
