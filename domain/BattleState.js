class BattleState {
  constructor({ attacker, defender, time = 0 }) {
    this.attacker = attacker;
    this.defender = defender;
    this.time = time; // combat time in seconds
  }
}

module.exports = BattleState;
