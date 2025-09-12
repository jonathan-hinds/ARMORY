class Matchmaking {
  constructor(abilities) {
    this.queue = [];
    this.abilities = abilities;
  }

  enqueue(char) {
    this.queue.push(char);
    if (this.queue.length >= 2) {
      const a = this.queue.shift();
      const b = this.queue.shift();
      const { runCombat } = require('./combatEngine');
      return runCombat(a, b, this.abilities);
    }
    return null;
  }
}

module.exports = Matchmaking;
