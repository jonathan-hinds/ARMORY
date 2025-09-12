const Character = require('../domain/Character');
const { computeDerived } = require('./derivedStats');
const { runCombat } = require('./combatEngine');

function randomAttributes(points) {
  const stats = { strength:0, stamina:0, agility:0, intellect:0, wisdom:0 };
  const keys = Object.keys(stats);
  for (let i = 0; i < points; i++) {
    const k = keys[Math.floor(Math.random()*keys.length)];
    stats[k]++;
  }
  return stats;
}

function randomRotation(abilityIds, length=3) {
  const rot = [];
  while (rot.length < length) {
    rot.push(abilityIds[Math.floor(Math.random()*abilityIds.length)]);
  }
  return rot;
}

function evaluate(genome, player, abilities, items) {
  const ai = buildCharacter(genome);
  ai.derived = computeDerived(ai, items).derived;
  ai.resources = { health: ai.derived.healthMax, mana: ai.derived.manaMax, stamina: ai.derived.staminaMax };
  const clone = JSON.parse(JSON.stringify(player));
  const playerChar = new Character(clone);
  playerChar.derived = computeDerived(playerChar, items).derived;
  playerChar.resources = { health: playerChar.derived.healthMax, mana: playerChar.derived.manaMax, stamina: playerChar.derived.staminaMax };
  const log = runCombat(ai, playerChar, abilities);
  const aiWin = log[log.length-1].includes(ai.name);
  return (aiWin ? 1 : 0) + ai.resources.health / ai.derived.healthMax;
}

function buildCharacter(genome) {
  return new Character({
    id: 'ai',
    playerId: 'ga',
    name: 'AI Challenger',
    basicType: genome.basicType,
    attributes: genome.attributes,
    rotation: genome.rotation
  });
}

function generateChallenge(player, abilities, items, generations = 3, populationSize = 5) {
  const abilityIds = Object.keys(abilities);
  let population = Array.from({ length: populationSize }, () => ({
    attributes: randomAttributes(15),
    rotation: randomRotation(abilityIds),
    basicType: Math.random() < 0.5 ? 'melee' : 'magic'
  }));

  for (let g = 0; g < generations; g++) {
    population.sort((a,b) => evaluate(b, player, abilities, items) - evaluate(a, player, abilities, items));
    population = population.slice(0, populationSize/2);
    while (population.length < populationSize) {
      const parent = population[Math.floor(Math.random()*population.length)];
      population.push({
        attributes: randomAttributes(15),
        rotation: randomRotation(abilityIds),
        basicType: parent.basicType
      });
    }
  }

  return buildCharacter(population[0]);
}

module.exports = { generateChallenge };
