class BattleState {
  constructor({ combatants = [] } = {}) {
    this.combatants = combatants;
    this.log = [];
  }
}

module.exports = BattleState;
