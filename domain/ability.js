function normalizeCostEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const typeRaw = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : null;
  if (!typeRaw) return null;
  const valueRaw = Number(entry.value);
  if (!Number.isFinite(valueRaw) || valueRaw <= 0) return null;
  return { type: typeRaw, value: Math.round(valueRaw) };
}

function normalizeCosts(costType, costValue, costs) {
  const entries = [];
  if (Array.isArray(costs)) {
    costs.forEach(item => {
      const normalized = normalizeCostEntry(item);
      if (normalized) {
        entries.push(normalized);
      }
    });
  }
  const legacy = normalizeCostEntry({ type: costType, value: costValue });
  if (legacy && !entries.length) {
    entries.push(legacy);
  }
  return entries;
}

function normalizeConditionalCostType(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === 'waiveifnodamagelastturn' ||
    normalized === 'waive_if_no_damage_last_turn' ||
    normalized === 'waive-if-no-damage-last-turn'
  ) {
    return 'waiveIfNoDamageLastTurn';
  }
  return normalized;
}

function normalizeResourceList(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) {
    return entry
      .map(resource => (typeof resource === 'string' ? resource.trim().toLowerCase() : null))
      .filter(Boolean);
  }
  if (typeof entry === 'string') {
    const normalized = entry.trim().toLowerCase();
    return normalized ? [normalized] : [];
  }
  return [];
}

function normalizeConditionalCostEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = normalizeConditionalCostType(entry.type);
  if (!type) return null;
  const resources = normalizeResourceList(entry.resources || entry.resource || entry.costResource);
  const result = { type };
  if (resources.length) {
    result.resources = resources;
  }
  if (entry.description && typeof entry.description === 'string') {
    result.description = entry.description;
  }
  return result;
}

function normalizeConditionalCosts(conditionalCost, conditionalCosts) {
  const entries = [];
  if (Array.isArray(conditionalCosts)) {
    conditionalCosts.forEach(item => {
      const normalized = normalizeConditionalCostEntry(item);
      if (normalized) {
        entries.push(normalized);
      }
    });
  }
  const legacy = normalizeConditionalCostEntry(conditionalCost);
  if (legacy && !entries.length) {
    entries.push(legacy);
  }
  return entries;
}

class Ability {
  constructor({
    id,
    name,
    school,
    costType,
    costValue,
    costs,
    cooldown,
    scaling = [],
    effects = [],
    isBasicAttack = false,
    conditionalCost,
    conditionalCosts,
  }) {
    this.id = id;
    this.name = name;
    this.school = school; // 'physical' or 'magical'
    this.costs = normalizeCosts(costType, costValue, costs);
    const primaryCost = this.costs[0] || null;
    this.costType = primaryCost ? primaryCost.type : costType; // legacy support
    this.costValue = primaryCost ? primaryCost.value : costValue; // legacy support
    this.cooldown = cooldown; // seconds
    this.scaling = scaling; // array of stat names
    this.effects = effects; // array of Effect descriptors
    this.isBasicAttack = !!isBasicAttack;
    this.conditionalCosts = normalizeConditionalCosts(conditionalCost, conditionalCosts);
    this.conditionalCost = this.conditionalCosts[0] || null;
  }
}

module.exports = Ability;
