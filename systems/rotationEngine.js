function getAction(combatant, now, abilityMap) {
  if (!combatant.character.rotation || combatant.character.rotation.length === 0) {
    return { type: 'basic', reason: 'noRotation' };
  }

  const abilityId = combatant.character.rotation[combatant.rotationIndex];
  const ability = abilityMap.get(abilityId);

  if (!ability) {
    return { type: 'basic', reason: 'missingAbility', abilityId };
  }

  const cooldownReady =
    !combatant.cooldowns[abilityId] || combatant.cooldowns[abilityId] <= now;
  const costType = ability.costType;
  const baseCost = typeof ability.costValue === 'number' ? ability.costValue : 0;
  const modifiers = combatant.resourceCostModifiers || {};
  const modifierValue = Number.isFinite(modifiers[costType]) ? modifiers[costType] : 0;
  const costReduction = Math.max(0, Math.min(1, modifierValue));
  const effectiveCost = Math.max(0, Math.ceil(baseCost * (1 - costReduction)));
  const availableResource = typeof combatant[costType] === 'number' ? combatant[costType] : 0;
  const hasResource = availableResource >= effectiveCost;

  if (cooldownReady && hasResource) {
    combatant[costType] -= effectiveCost;
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
      resourceType: costType,
      required: effectiveCost,
      available: availableResource,
    };
}

module.exports = { getAction };
