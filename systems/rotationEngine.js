function getAction(combatant, now, abilityMap) {
  if (!combatant.character.rotation || combatant.character.rotation.length === 0) {
    return { type: 'basic', reason: 'noRotation' };
  }

  const abilityId = combatant.character.rotation[combatant.rotationIndex];
  const ability = abilityMap.get(abilityId);

  if (!ability) {
    return { type: 'basic', reason: 'missingAbility', abilityId };
  }

  const behavior = combatant.behavior || (combatant.character && combatant.character.behavior) || null;
  if (behavior && ability.effects && ability.effects.some(e => e && e.type === 'Heal')) {
    const threshold = typeof behavior.healThreshold === 'number' ? behavior.healThreshold : null;
    const maxHealth = combatant.derived && typeof combatant.derived.health === 'number' ? combatant.derived.health : 0;
    if (threshold !== null && maxHealth > 0) {
      const clamped = Math.min(Math.max(threshold, 0), 1);
      const ratio = combatant.health / maxHealth;
      if (ratio > clamped) {
        return { type: 'basic', reason: 'behavior', ability, abilityId };
      }
    }
  }

  const cooldownReady =
    !combatant.cooldowns[abilityId] || combatant.cooldowns[abilityId] <= now;
  const availableResource =
    typeof combatant[ability.costType] === 'number'
      ? combatant[ability.costType]
      : 0;
  const hasResource = availableResource >= ability.costValue;

  if (cooldownReady && hasResource) {
    combatant[ability.costType] -= ability.costValue;
    combatant.cooldowns[abilityId] = now + ability.cooldown;
    combatant.rotationIndex =
      (combatant.rotationIndex + 1) % combatant.character.rotation.length;
    return { type: 'ability', ability };
  }

  if (!cooldownReady) {
    const remaining = combatant.cooldowns[abilityId] - now;
    return {
      type: 'basic',
      reason: 'cooldown',
      ability,
      abilityId,
      remainingCooldown: remaining > 0 ? remaining : 0,
    };
  }

  return {
    type: 'basic',
    reason: 'resource',
    ability,
    abilityId,
    resourceType: ability.costType,
    required: ability.costValue,
    available: availableResource,
  };
}

module.exports = { getAction };
