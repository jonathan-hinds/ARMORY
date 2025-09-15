function getAction(combatant, now, abilityMap) {
  if (!combatant.character.rotation || combatant.character.rotation.length === 0) {
    return { type: 'basic' };
  }
  const abilityId = combatant.character.rotation[combatant.rotationIndex];
  const ability = abilityMap.get(abilityId);
  if (
    ability &&
    (!combatant.cooldowns[abilityId] || combatant.cooldowns[abilityId] <= now) &&
    combatant[ability.costType] >= ability.costValue
  ) {
    combatant[ability.costType] -= ability.costValue;
    combatant.cooldowns[abilityId] = now + ability.cooldown;
    combatant.rotationIndex =
      (combatant.rotationIndex + 1) % combatant.character.rotation.length;
    return { type: 'ability', ability };
  }
  return { type: 'basic' };
}

module.exports = { getAction };
