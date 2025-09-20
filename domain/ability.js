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
  }
}

module.exports = Ability;
