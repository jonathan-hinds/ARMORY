function normalizeResource(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function getConditionalCostEntries(ability) {
  if (!ability) return [];
  if (Array.isArray(ability.conditionalCosts) && ability.conditionalCosts.length) {
    return ability.conditionalCosts;
  }
  if (ability.conditionalCost) {
    return [ability.conditionalCost];
  }
  return [];
}

function appliesToResource(entry, resource) {
  if (!entry) return false;
  const normalizedResource = normalizeResource(resource);
  if (!normalizedResource) return false;
  if (!Array.isArray(entry.resources) || entry.resources.length === 0) {
    return true;
  }
  return entry.resources.some(res => normalizeResource(res) === normalizedResource);
}

function evaluateConditionalCost(ability, combatant, resource, baseCost) {
  const entries = getConditionalCostEntries(ability);
  if (!entries.length) return null;
  const normalizedResource = normalizeResource(resource);
  let override = null;
  let waived = false;
  let matchedType = null;
  entries.forEach(entry => {
    if (!entry || !appliesToResource(entry, normalizedResource)) return;
    const type = typeof entry.type === 'string' ? entry.type : null;
    switch (type) {
      case 'waiveIfNoDamageLastTurn':
      case 'waiveifnodamagelastturn': {
        const tookDamage = combatant && combatant.damageTakenLastTurn;
        if (!tookDamage) {
          override = 0;
          waived = true;
          matchedType = 'waiveIfNoDamageLastTurn';
        }
        break;
      }
      default:
        break;
    }
  });
  if (override == null) {
    return null;
  }
  return {
    base: Math.max(0, Number.isFinite(override) ? override : baseCost),
    waived,
    type: matchedType,
  };
}

function getAction(combatant, now, abilityMap) {
  if (!combatant.character.rotation || combatant.character.rotation.length === 0) {
    return { type: 'basic', reason: 'noRotation' };
  }

  const abilityId = combatant.character.rotation[combatant.rotationIndex];
  const ability = abilityMap.get(abilityId);

  if (!ability) {
    combatant.rotationIndex =
      (combatant.rotationIndex + 1) % combatant.character.rotation.length;
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
    const resource = normalizeResource(entry.type);
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
    const conditional = evaluateConditionalCost(ability, combatant, resource, baseCost);
    const adjustedBase = conditional && Number.isFinite(conditional.base) ? conditional.base : baseCost;
    const modifierValue = Number.isFinite(modifiers[resource]) ? modifiers[resource] : 0;
    const costReduction = Math.max(0, Math.min(1, modifierValue));
    let effective = Math.max(0, Math.ceil(adjustedBase * (1 - costReduction)));
    if (conditional && conditional.waived) {
      effective = 0;
    }
    const available = Number.isFinite(combatant[resource]) ? combatant[resource] : 0;
    return {
      resource,
      base: baseCost,
      required: effective,
      available,
      hasEnough: available >= effective,
      waived: conditional ? conditional.waived : false,
      conditionalType: conditional ? conditional.type : null,
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
    combatant.rotationIndex =
      (combatant.rotationIndex + 1) % combatant.character.rotation.length;
    return {
      type: 'basic',
      reason: 'cooldown',
      ability,
      abilityId,
      remainingCooldown: remaining > 0 ? remaining : 0,
    };
  }

  combatant.rotationIndex =
    (combatant.rotationIndex + 1) % combatant.character.rotation.length;
  return {
    type: 'basic',
    reason: 'resource',
    ability,
    abilityId,
    costs: payments,
  };
}

module.exports = { getAction };
