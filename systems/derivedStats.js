const A = 3;
const K = 0.1;

function attackInterval(agi) {
  return 2.0 + A * Math.exp(-K * agi);
}

function compute(character) {
  const attr = character.attributes || {};
  const strength = attr.strength || 0;
  const stamina = attr.stamina || 0;
  const agility = attr.agility || 0;
  const intellect = attr.intellect || 0;
  const wisdom = attr.wisdom || 0;

  return {
    minMeleeAttack: strength * 2,
    maxMeleeAttack: strength * 2 + 4,
    minMagicAttack: intellect * 2,
    maxMagicAttack: intellect * 2 + 4,
    attackIntervalSeconds: attackInterval(agility),
    health: 100 + stamina * 10,
    mana: 50 + wisdom * 8,
    stamina: 50 + stamina * 8,
    meleeResist: 0,
    magicResist: 0,
  };
}

module.exports = { compute };
