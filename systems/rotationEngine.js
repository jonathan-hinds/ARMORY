function takeAction(character, now, abilities) {
  if (!character.rotation || character.rotation.length === 0) {
    return { type: 'basic', school: character.basicType };
  }
  const abilityId = character.rotation[character.rotationIndex];
  const ability = abilities[abilityId];
  const readyTime = character.cooldowns[abilityId] || 0;
  const resource = character.resources[ability.costType];
  const canCast = ability && readyTime <= now && resource >= ability.costValue;

  if (canCast) {
    character.cooldowns[abilityId] = now + ability.cooldown;
    character.resources[ability.costType] -= ability.costValue;
    character.rotationIndex = (character.rotationIndex + 1) % character.rotation.length;
    return { type: 'ability', ability };
  }
  return { type: 'basic', school: character.basicType };
}

module.exports = { takeAction };
