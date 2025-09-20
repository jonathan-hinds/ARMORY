function getAction(combatant, now, abilityMap) {
  if (!combatant.character.rotation || combatant.character.rotation.length === 0) {
    return { type: 'basic', reason: 'noRotation' };
  }

  const abilityId = combatant.character.rotation[combatant.rotationIndex];
  const ability = abilityMap.get(abilityId);

  if (!ability) {
    return { type: 'basic', reason: 'missingAbility', abilityId };
  }

  if (ability.isBasicAttack) {
    combatant.rotationIndex =
      (combatant.rotationIndex + 1) % combatant.character.rotation.length;
    return { type: 'basic', reason: 'rotationBasic', ability };
  }

  const cooldownReady =
    !combatant.cooldowns[abilityId] || combatant.cooldowns[abilityId] <= now;
  const costs =
    Array.isArray(ability.costs) && ability.costs.length
      ? ability.costs
      : ability.costType
      ? [{ type: ability.costType, value: ability.costValue }]
      : [];
  const modifiers = combatant.resourceCostModifiers || {};
  const payments = costs.map(entry => {
    const resource = typeof entry.type === 'string' ? entry.type : null;
    const baseCost = Number.isFinite(entry.value) ? entry.value : 0;
    if (!resource || baseCost <= 0) {
      return {
        resource,
        base: baseCost,
        required: 0,
        available: resource && Number.isFinite(combatant[resource]) ? combatant[resource] : 0,
        hasEnough: true,
      };
    }
    const modifierValue = Number.isFinite(modifiers[resource]) ? modifiers[resource] : 0;
    const costReduction = Math.max(0, Math.min(1, modifierValue));
    const effective = Math.max(0, Math.ceil(baseCost * (1 - costReduction)));
    const available = Number.isFinite(combatant[resource]) ? combatant[resource] : 0;
    return {
      resource,
      base: baseCost,
      required: effective,
      available,
      hasEnough: available >= effective,
    };
  });
  const hasResources = payments.every(payment => payment.hasEnough !== false);

  if (cooldownReady && hasResources) {
    payments.forEach(payment => {
      if (!payment || !payment.resource || payment.required <= 0) return;
      if (!Number.isFinite(combatant[payment.resource])) return;
      combatant[payment.resource] -= payment.required;
    });
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
    costs: payments,
  };
}

module.exports = { getAction };
