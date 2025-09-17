const { compute } = require('./derivedStats');
const { getAction } = require('./rotationEngine');
const { applyEffect, tick } = require('./effectsEngine');
const { pushLog } = require('./log');
const { USEABLE_SLOTS } = require('../models/utils');

const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];

function resolveEquipment(character, equipmentMap) {
  const resolved = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    const itemId = character.equipment && character.equipment[slot];
    if (itemId && equipmentMap && equipmentMap.has(itemId)) {
      resolved[slot] = equipmentMap.get(itemId);
    } else {
      resolved[slot] = null;
    }
  });
  return resolved;
}

function resolveUseables(character, equipmentMap) {
  const resolved = {};
  USEABLE_SLOTS.forEach(slot => {
    const itemId = character.useables && character.useables[slot];
    if (itemId && equipmentMap && equipmentMap.has(itemId)) {
      resolved[slot] = equipmentMap.get(itemId);
    } else {
      resolved[slot] = null;
    }
  });
  return resolved;
}

function createCombatant(character, equipmentMap) {
  const equipped = resolveEquipment(character, equipmentMap);
  const useables = resolveUseables(character, equipmentMap);
  const derived = compute(character, equipped);
  const useableEntries = USEABLE_SLOTS.map(slot => {
    const item = useables[slot];
    if (!item || item.slot !== 'useable') return null;
    return {
      slot,
      item,
      used: false,
    };
  }).filter(Boolean);
  return {
    character,
    derived,
    equipment: equipped,
    useables: useableEntries,
    consumedUseables: [],
    usedUseableIds: new Set(),
    health: derived.health,
    mana: derived.mana,
    stamina: derived.stamina,
    rotationIndex: 0,
    cooldowns: {},
    damageBuff: 0,
    buffs: [],
    chanceBuffs: [],
    dots: [],
    stunnedUntil: 0,
    onHitEffects: derived.onHitEffects || [],
    basicAttackEffectType: derived.basicAttackEffectType,
  };
}

function meetsUseTrigger(trigger, combatant) {
  if (!trigger || typeof trigger !== 'object') return false;
  if (trigger.type === 'auto') {
    if (trigger.stat === 'healthPct') {
      const max = combatant.derived && combatant.derived.health ? combatant.derived.health : 1;
      const pct = max > 0 ? combatant.health / max : 0;
      const threshold = typeof trigger.threshold === 'number' ? trigger.threshold : 0;
      return pct <= threshold;
    }
  }
  return false;
}

function tryUseCombatantItem(combatant, enemy, now, log) {
  if (!combatant.useables || !combatant.useables.length) return;
  combatant.useables.forEach(entry => {
    if (!entry || entry.used) return;
    const trigger = entry.item && entry.item.useTrigger;
    const effect = entry.item && entry.item.useEffect;
    if (combatant.usedUseableIds && entry.item && combatant.usedUseableIds.has(entry.item.id)) {
      entry.used = true;
      return;
    }
    if (!effect || !meetsUseTrigger(trigger, combatant)) return;
    entry.used = true;
    if (combatant.usedUseableIds && entry.item) {
      combatant.usedUseableIds.add(entry.item.id);
    }
    pushLog(log, `${combatant.character.name} consumes ${entry.item.name}`, {
      sourceId: combatant.character.id,
      targetId: combatant.character.id,
      kind: 'useable',
      itemId: entry.item.id,
    });
    applyEffect(combatant, combatant, effect, now, log, {
      resolution: { hit: true },
      enemy,
    });
    if (entry.item.useConsumed) {
      combatant.consumedUseables.push({ slot: entry.slot, itemId: entry.item.id });
    }
  });
}

function state(c) {
  return {
    id: c.character.id,
    name: c.character.name,
    health: c.health,
    mana: c.mana,
    stamina: c.stamina,
    maxHealth: c.derived.health,
    maxMana: c.derived.mana,
    maxStamina: c.derived.stamina,
    useables: USEABLE_SLOTS.map(slot => {
      const entry =
        c.useables && Array.isArray(c.useables)
          ? c.useables.find(useable => useable && useable.slot === slot)
          : null;
      return {
        slot,
        hasItem: !!entry,
        used: !!(entry && entry.used),
      };
    }),
  };
}

function cloneEffect(effect) {
  return JSON.parse(JSON.stringify(effect));
}

function processOnHitEffects(source, target, trigger, context = {}, now, log) {
  if (!source.onHitEffects || source.onHitEffects.length === 0) return;
  source.onHitEffects.forEach(entry => {
    if (!entry) return;
    const triggerMatch = entry.trigger === 'any' || entry.trigger === trigger;
    if (!triggerMatch) return;
    if (entry.conditions) {
      if (entry.conditions.damageType && context.damageType !== entry.conditions.damageType) {
        return;
      }
      if (entry.conditions.school && (!context.ability || context.ability.school !== entry.conditions.school)) {
        return;
      }
    }
    const chance = typeof entry.chance === 'number' ? entry.chance : 1;
    if (Math.random() > chance) return;
    pushLog(log, `${source.character.name}'s ${entry.itemName} triggers an effect`, {
      sourceId: source.character.id,
      targetId: target.character.id,
      kind: 'equipmentEffect',
      itemId: entry.itemId,
    });
    const effect = cloneEffect(entry.effect);
    const baseType =
      effect.type === 'MagicDamage'
        ? 'magical'
        : effect.type === 'PhysicalDamage'
        ? 'physical'
        : context.damageType ||
          (source.derived && source.derived.weaponDamageType
            ? source.derived.weaponDamageType
            : source.basicAttackEffectType === 'MagicDamage'
            ? 'magical'
            : 'physical');
    let resolution = null;
    if (context && context.resolution && context.resolution.hit) {
      resolution = {
        hit: true,
        outcome: context.resolution.outcome || 'hit',
        damageType: context.resolution.damageType || baseType,
      };
    }
    if (!resolution) {
      resolution = { hit: true, outcome: 'hit', damageType: baseType };
    } else if (!resolution.damageType) {
      resolution.damageType = baseType;
    }
    applyEffect(source, target, effect, now, log, { resolution });
  });
}

async function runCombat(charA, charB, abilityMap, equipmentMap, onUpdateOrOptions, maybeOptions) {
  let onUpdate = null;
  let options = {};

  if (typeof onUpdateOrOptions === 'function') {
    onUpdate = onUpdateOrOptions;
    options = maybeOptions || {};
  } else if (onUpdateOrOptions && typeof onUpdateOrOptions === 'object') {
    options = onUpdateOrOptions;
  }

  const a = createCombatant(charA, equipmentMap);
  const b = createCombatant(charB, equipmentMap);
  const nextTimes = [0, 0];
  const combatants = [a, b];
  const collectLog = options.collectLog !== false;
  const log = collectLog ? [] : null;
  const fastForward = !!options.fastForward;
  let now = 0;
  if (onUpdate) onUpdate({ type: 'start', a: state(a), b: state(b), log: [] });
  while (a.health > 0 && b.health > 0) {
    tryUseCombatantItem(a, b, now, log);
    tryUseCombatantItem(b, a, now, log);
    const idx = nextTimes[0] <= nextTimes[1] ? 0 : 1;
    const actor = combatants[idx];
    const target = combatants[1 - idx];
    now = nextTimes[idx];
    const before = log ? log.length : 0;
    tick(actor, now, log);
    tick(target, now, log);
    if (actor.stunnedUntil > now) {
      pushLog(log, `${actor.character.name} is stunned and misses the turn`, {
        sourceId: actor.character.id,
        targetId: actor.character.id,
        kind: 'stun',
      });
    } else {
      const action = getAction(actor, now, abilityMap);
      if (action.type === 'ability') {
        pushLog(log, `${actor.character.name} uses ${action.ability.name}`, {
          sourceId: actor.character.id,
          targetId: target.character.id,
          kind: 'ability',
          abilityId: action.ability.id,
        });
        let lastResolution = null;
        let landedDamage = false;
        const damageResults = [];
        action.ability.effects.forEach(effect => {
          const result = applyEffect(actor, target, effect, now, log, { resolution: lastResolution });
          if (result && result.resolution) {
            lastResolution = result.resolution;
          }
          if (result && result.hit && Number.isFinite(result.amount) && result.amount > 0) {
            landedDamage = true;
            damageResults.push(result);
          }
        });
        if (landedDamage) {
          const contextForOnHit = { ability: action.ability };
          const primary = damageResults.find(res => res && res.damageType);
          if (primary) {
            contextForOnHit.damageType = primary.damageType;
            contextForOnHit.resolution = primary.resolution;
          } else if (lastResolution && lastResolution.hit) {
            contextForOnHit.resolution = lastResolution;
            if (lastResolution.damageType) {
              contextForOnHit.damageType = lastResolution.damageType;
            }
          }
          processOnHitEffects(actor, target, 'ability', contextForOnHit, now, log);
        }
      } else {
        const effectType =
          actor.basicAttackEffectType || (actor.character.basicType === 'melee' ? 'PhysicalDamage' : 'MagicDamage');
        let message;
        if (action.reason === 'cooldown' && action.ability) {
          const remaining =
            typeof action.remainingCooldown === 'number' ? Math.max(0, action.remainingCooldown) : null;
          const remainingText = remaining !== null ? ` (${remaining.toFixed(1)}s remaining)` : '';
          message = `${action.ability.name} is on cooldown${remainingText}, so ${actor.character.name} performs a ${
            effectType === 'PhysicalDamage' ? 'melee' : 'magic'
          } basic attack.`;
        } else if (action.reason === 'resource' && action.ability) {
          const available = typeof action.available === 'number' ? action.available : 0;
          message = `${actor.character.name} lacks ${action.resourceType} (${available}/${action.required}) for ${
            action.ability.name
          } and performs a ${effectType === 'PhysicalDamage' ? 'melee' : 'magic'} basic attack.`;
        } else if (action.reason === 'missingAbility') {
          message = `${actor.character.name} cannot use unknown ability ${action.abilityId} and performs a ${
            effectType === 'PhysicalDamage' ? 'melee' : 'magic'
          } basic attack.`;
        } else if (action.reason === 'noRotation') {
          message = `${actor.character.name} has no rotation ready and performs a ${
            effectType === 'PhysicalDamage' ? 'melee' : 'magic'
          } basic attack.`;
        }

        pushLog(log, message || `${actor.character.name} performs a ${effectType === 'PhysicalDamage' ? 'melee' : 'magic'} basic attack.`, {
          sourceId: actor.character.id,
          targetId: target.character.id,
          kind: 'basicAttack',
        });

        const effect =
          effectType === 'PhysicalDamage'
            ? { type: 'PhysicalDamage', value: 0 }
            : { type: 'MagicDamage', value: 0 };
        const result = applyEffect(actor, target, effect, now, log);
        if (result && result.hit && Number.isFinite(result.amount) && result.amount > 0) {
          const contextForOnHit = {
            damageType: result.damageType || (effectType === 'PhysicalDamage' ? 'physical' : 'magical'),
            resolution: result.resolution,
          };
          processOnHitEffects(actor, target, 'basic', contextForOnHit, now, log);
        }
      }
    }
    nextTimes[idx] += actor.derived.attackIntervalSeconds;
    const next = Math.min(nextTimes[0], nextTimes[1]);
    const wait = Math.max(0, next - now);
    const newLogs = log && log.length > before ? log.slice(before) : [];
    if (onUpdate) onUpdate({ type: 'update', a: state(a), b: state(b), log: newLogs });
    if (!fastForward && a.health > 0 && b.health > 0) {
      await new Promise(res => setTimeout(res, wait * 1000));
    }
  }
  const winner = a.health > 0 ? a : b;
  return {
    winnerId: winner.character.id,
    log: log || [],
    duration: now,
    finalA: state(a),
    finalB: state(b),
    consumedUseables: {
      [a.character.id]: a.consumedUseables.slice(),
      [b.character.id]: b.consumedUseables.slice(),
    },
  };
}

module.exports = { runCombat };
