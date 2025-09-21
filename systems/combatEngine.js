const { compute } = require('./derivedStats');
const { getAction } = require('./rotationEngine');
const { applyEffect, tick } = require('./effectsEngine');
const { pushLog } = require('./log');
const { USEABLE_SLOTS } = require('../models/utils');

const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const MAX_RESIST = 0.75;
const MIN_DYNAMIC_ATTACK_INTERVAL = 0.5;

function clampResist(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_RESIST, Math.max(0, value));
}

function applyBossNegationToDerived(derived, negation) {
  if (!derived || !negation) return null;
  const meleeTarget = Number.isFinite(negation.melee) ? Math.max(0, negation.melee) : 0;
  const magicTarget = Number.isFinite(negation.magic) ? Math.max(0, negation.magic) : 0;
  if (meleeTarget <= 0 && magicTarget <= 0) {
    return null;
  }
  const beforeMelee = clampResist(derived.meleeResist);
  const beforeMagic = clampResist(derived.magicResist);
  const meleeResist = clampResist(beforeMelee + meleeTarget);
  const magicResist = clampResist(beforeMagic + magicTarget);
  derived.meleeResist = meleeResist;
  derived.magicResist = magicResist;
  return {
    meleeBonus: Math.max(0, meleeResist - beforeMelee),
    magicBonus: Math.max(0, magicResist - beforeMagic),
    meleeResist,
    magicResist,
    targetMeleeBonus: meleeTarget,
    targetMagicBonus: magicTarget,
  };
}

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

function getEffectiveAttackInterval(combatant, now, { consume = true } = {}) {
  if (!combatant) return MIN_DYNAMIC_ATTACK_INTERVAL;
  const base =
    combatant.derived && Number.isFinite(combatant.derived.attackIntervalSeconds)
      ? combatant.derived.attackIntervalSeconds
      : MIN_DYNAMIC_ATTACK_INTERVAL;
  const adjustments = Array.isArray(combatant.attackIntervalAdjustments)
    ? combatant.attackIntervalAdjustments
    : [];
  if (!adjustments.length) {
    return Math.max(MIN_DYNAMIC_ATTACK_INTERVAL, base);
  }
  const currentTime = Number.isFinite(now) ? now : null;
  let totalModifier = 0;
  const remaining = [];
  adjustments.forEach(entry => {
    if (!entry) return;
    const expiresAt = Number.isFinite(entry.expiresAt) ? entry.expiresAt : null;
    if (expiresAt != null && currentTime != null && currentTime >= expiresAt) {
      return;
    }
    const amount = Number(entry.amount);
    if (Number.isFinite(amount) && amount !== 0) {
      totalModifier += amount;
    }
    if (consume) {
      const uses = Number.isFinite(entry.remainingAttacks) ? entry.remainingAttacks : null;
      if (uses != null) {
        const nextUses = uses - 1;
        if (nextUses > 0) {
          remaining.push({ ...entry, remainingAttacks: nextUses });
        }
      } else {
        remaining.push(entry);
      }
    } else {
      remaining.push(entry);
    }
  });
  combatant.attackIntervalAdjustments = remaining;
  const baseInterval = Math.max(MIN_DYNAMIC_ATTACK_INTERVAL, base);
  return Math.max(MIN_DYNAMIC_ATTACK_INTERVAL, baseInterval + totalModifier);
}

function createCombatant(character, equipmentMap) {
  const equipped = resolveEquipment(character, equipmentMap);
  const useables = resolveUseables(character, equipmentMap);
  const derived = compute(character, equipped);
  const negationDetails = character && character.bossNegation ? applyBossNegationToDerived(derived, character.bossNegation) : null;
  const useableEntries = USEABLE_SLOTS.map(slot => {
    const item = useables[slot];
    if (!item || item.slot !== 'useable') return null;
    return {
      slot,
      item,
      used: false,
    };
  }).filter(Boolean);
  const combatant = {
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
    resourceCostModifiers: {},
    resourceCostBuffs: [],
    dots: [],
    hots: [],
    resourceOverTime: [],
    pendingDamageBonuses: [],
    stunnedAttacksRemaining: 0,
    onHitEffects: derived.onHitEffects || [],
    basicAttackEffectType: derived.basicAttackEffectType,
    attacksPerformed: 0,
    resistShields: [],
    damageGuards: [],
    damageReflections: [],
    damageHealShields: [],
    attackIntervalAdjustments: [],
  };
  if (negationDetails) {
    combatant.negation = { ...negationDetails };
  }
  return combatant;
}

function summarizeDamageEvents(target, damageResults, effectType) {
  if (!Array.isArray(damageResults) || damageResults.length === 0) {
    return [];
  }
  return damageResults
    .filter(entry => entry && Number.isFinite(entry.amount) && entry.amount > 0)
    .map(entry => ({
      target,
      amount: entry.amount,
      damageType: entry.damageType || null,
      effectType,
    }));
}

function executeCombatAction(actor, target, now, abilityMap, log) {
  const before = log ? log.length : 0;
  const summary = {
    stunned: false,
    actionType: null,
    ability: null,
    attemptedAttack: false,
    landedDamage: false,
    damageEvents: [],
    totalDamage: 0,
    stunApplied: false,
    logs: [],
  };

  if (!actor || !target) {
    summary.logs = [];
    return summary;
  }

  if ((actor.stunnedAttacksRemaining || 0) > 0) {
    const remainingBefore = Number.isFinite(actor.stunnedAttacksRemaining)
      ? actor.stunnedAttacksRemaining
      : 0;
    actor.stunnedAttacksRemaining = Math.max(0, remainingBefore - 1);
    pushLog(log, `${actor.character.name} is stunned and misses their attack`, {
      sourceId: actor.character.id,
      targetId: actor.character.id,
      kind: 'stun',
    });
    summary.stunned = true;
    summary.actionType = 'stunned';
  } else {
    const action = getAction(actor, now, abilityMap);
    summary.actionType = action.type;
    if (action.type === 'ability') {
      summary.ability = action.ability;
      pushLog(log, `${actor.character.name} uses ${action.ability.name}`, {
        sourceId: actor.character.id,
        targetId: target.character.id,
        kind: 'ability',
        abilityId: action.ability.id,
      });
      let lastResolution = null;
      let lastResult = null;
      let landedDamage = false;
      let pendingBonusAvailable = true;
      const damageResults = [];
      action.ability.effects.forEach((effect, index) => {
        const effectContext = {
          resolution: lastResolution,
          lastResult,
          ability: action.ability,
          actor,
          target,
          actionType: 'ability',
          effectIndex: index,
          consumeDamageBonus: pendingBonusAvailable,
          now,
        };
        const result = applyEffect(actor, target, effect, now, log, effectContext);
        if (result && result.resolution) {
          lastResolution = result.resolution;
        }
        if (result) {
          lastResult = result;
        }
        if (result && result.bonusDamageConsumed) {
          pendingBonusAvailable = false;
        }
        if (effect.type === 'Stun' && result && result.hit) {
          summary.stunApplied = true;
        }
        if (result && result.additionalStun) {
          summary.stunApplied = true;
        }
        if (result && result.hit && Number.isFinite(result.amount) && result.amount > 0) {
          landedDamage = true;
          damageResults.push({
            amount: result.amount,
            damageType: result.damageType || null,
            resolution: result.resolution || null,
          });
          const resolvedDamageType =
            result.damageType ||
            (effect.type === 'MagicDamage'
              ? 'magical'
              : effect.type === 'PhysicalDamage'
              ? 'physical'
              : null);
          handleDamageTaken(target, actor, resolvedDamageType, result.amount, now, log);
        }
      });
      const attemptedAttack = lastResolution !== null;
      if (landedDamage) {
        summary.landedDamage = true;
        summary.damageEvents = summarizeDamageEvents(target, damageResults, 'ability');
        summary.totalDamage = summary.damageEvents.reduce((acc, entry) => acc + entry.amount, 0);
      }
      const contextForOnHit = { ability: action.ability, actionType: 'ability' };
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
      const triggerResult = primary || damageResults[0];
      if (triggerResult) {
        tryUseCombatantItem(actor, target, now, log, {
          event: 'hit',
          actor,
          target,
          actionType: 'ability',
          ability: action.ability,
          damageType: triggerResult.damageType || contextForOnHit.damageType,
          resolution: triggerResult.resolution || contextForOnHit.resolution,
          amount: triggerResult.amount,
          hit: true,
          isAttack: true,
        });
      }
      processOnHitEffects(actor, target, 'ability', contextForOnHit, now, log);
      const actionContext = {
        event: 'action',
        actor,
        target,
        actionType: 'ability',
        ability: action.ability,
        isAbility: true,
        isBasic: false,
        isAttack: attemptedAttack,
        isFirstAttack: attemptedAttack && ((actor.attacksPerformed || 0) <= 0),
        hit: landedDamage,
      };
      tryUseCombatantItem(actor, target, now, log, actionContext);
      if (attemptedAttack) {
        actor.attacksPerformed = (actor.attacksPerformed || 0) + 1;
        summary.attemptedAttack = true;
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
        let detail = '';
        if (Array.isArray(action.costs) && action.costs.length) {
          const shortages = action.costs
            .filter(entry => entry && entry.resource && entry.required > (entry.available || 0))
            .map(entry => {
              const avail = Number.isFinite(entry.available) ? entry.available : 0;
              const req = Number.isFinite(entry.required) ? entry.required : 0;
              return `${entry.resource} (${avail}/${req})`;
            });
          if (shortages.length) {
            detail = ` lacking ${shortages.join(' and ')}`;
          }
        }
        message = `${actor.character.name} cannot use ${action.ability.name}${detail || ''} and performs a ${
          effectType === 'PhysicalDamage' ? 'melee' : 'magic'
        } basic attack.`;
      } else if (action.reason === 'missingAbility') {
        message = `${actor.character.name} cannot use unknown ability ${action.abilityId} and performs a ${
          effectType === 'PhysicalDamage' ? 'melee' : 'magic'
        } basic attack.`;
      } else if (action.reason === 'noRotation') {
        message = `${actor.character.name} has no rotation ready and performs a ${
          effectType === 'PhysicalDamage' ? 'melee' : 'magic'
        } basic attack.`;
      }

      pushLog(
        log,
        message || `${actor.character.name} performs a ${effectType === 'PhysicalDamage' ? 'melee' : 'magic'} basic attack.`,
        {
          sourceId: actor.character.id,
          targetId: target.character.id,
          kind: 'basicAttack',
        },
      );

      const effect =
        effectType === 'PhysicalDamage'
          ? { type: 'PhysicalDamage', value: 0 }
          : { type: 'MagicDamage', value: 0 };
      const basicContext = {
        actor,
        target,
        actionType: 'basic',
        consumeDamageBonus: true,
        now,
      };
      const result = applyEffect(actor, target, effect, now, log, basicContext);
      if (result && result.hit && Number.isFinite(result.amount) && result.amount > 0) {
        const resolvedDamageType = result.damageType || (effectType === 'PhysicalDamage' ? 'physical' : 'magical');
        handleDamageTaken(target, actor, resolvedDamageType, result.amount, now, log);
        summary.landedDamage = true;
        summary.damageEvents = summarizeDamageEvents(target, [{
          amount: result.amount,
          damageType: resolvedDamageType,
        }], 'basic');
        summary.totalDamage = result.amount;
        tryUseCombatantItem(actor, target, now, log, {
          event: 'hit',
          actor,
          target,
          actionType: 'basic',
          damageType: resolvedDamageType,
          resolution: result.resolution,
          amount: result.amount,
          hit: true,
          isAttack: true,
        });
        const contextForOnHit = {
          damageType: result.damageType || (effectType === 'PhysicalDamage' ? 'physical' : 'magical'),
          resolution: result.resolution,
          actionType: 'basic',
        };
        processOnHitEffects(actor, target, 'basic', contextForOnHit, now, log);
      }
      const actionContext = {
        event: 'action',
        actor,
        target,
        actionType: 'basic',
        isAbility: false,
        isBasic: true,
        isAttack: true,
        hit: !!(result && result.hit),
        isFirstAttack: (actor.attacksPerformed || 0) <= 0,
      };
      tryUseCombatantItem(actor, target, now, log, actionContext);
      actor.attacksPerformed = (actor.attacksPerformed || 0) + 1;
      summary.attemptedAttack = true;
    }
  }

  if (log && log.length > before) {
    summary.logs = log.slice(before);
  }
  return summary;
}

function meetsUseTrigger(trigger, combatant, context = {}) {
  if (!trigger || typeof trigger !== 'object') return false;
  if (trigger.type === 'auto') {
    const pctStats = {
      healthPct: { current: 'health', max: 'health' },
      manaPct: { current: 'mana', max: 'mana' },
      staminaPct: { current: 'stamina', max: 'stamina' },
    };
    const statConfig = pctStats[trigger.stat];
    if (statConfig) {
      const current = Number.isFinite(combatant[statConfig.current]) ? combatant[statConfig.current] : 0;
      const max =
        combatant.derived && Number.isFinite(combatant.derived[statConfig.max])
          ? combatant.derived[statConfig.max]
          : 0;
      const safeMax = max > 0 ? max : 1;
      const pct = safeMax > 0 ? current / safeMax : 0;
      const threshold = typeof trigger.threshold === 'number' ? trigger.threshold : 0;
      return pct <= threshold;
    }
  } else if (trigger.type === 'onDamageTaken') {
    if (context.event !== 'damageTaken') return false;
    if (trigger.owner === false && context.target === combatant) {
      return false;
    }
    if (trigger.owner !== false && context.target && context.target !== combatant) {
      return false;
    }
    if (trigger.damageType) {
      return context.damageType === trigger.damageType;
    }
    return true;
  } else if (trigger.type === 'onAction') {
    if (!context || context.event !== 'action') return false;
    const actor = context.actor;
    const ownerRequired = trigger.owner !== false;
    if (ownerRequired) {
      if (actor && actor !== combatant) {
        return false;
      }
    } else if (actor === combatant) {
      return false;
    }
    const actions = Array.isArray(trigger.actions)
      ? trigger.actions
      : trigger.action
      ? [trigger.action]
      : null;
    if (actions && !actions.includes(context.actionType)) {
      return false;
    }
    if (trigger.requiresAttack && !context.isAttack) {
      return false;
    }
    if (trigger.firstOnly && !context.isFirstAttack) {
      return false;
    }
    return true;
  } else if (trigger.type === 'onHit') {
    if (!context || context.event !== 'hit') return false;
    if (!context.hit) return false;
    const actor = context.actor;
    const ownerRequired = trigger.owner !== false;
    if (ownerRequired) {
      if (actor && actor !== combatant) {
        return false;
      }
    } else if (actor === combatant) {
      return false;
    }
    const actions = Array.isArray(trigger.actions)
      ? trigger.actions
      : trigger.action
      ? [trigger.action]
      : null;
    if (actions && !actions.includes(context.actionType)) {
      return false;
    }
    if (trigger.requiresAttack && !context.isAttack) {
      return false;
    }
    if (trigger.damageType && context.damageType && trigger.damageType !== context.damageType) {
      return false;
    }
    return true;
  }
  return false;
}

function tryUseCombatantItem(combatant, enemy, now, log, context = {}) {
  if (!combatant.useables || !combatant.useables.length) return;
  combatant.useables.forEach(entry => {
    if (!entry) return;
    if (entry.disabled) return;
    const item = entry.item;
    if (!item) return;
    const repeatable = !!item.useRepeatable;
    if (!repeatable && entry.used) return;
    const trigger = item.useTrigger;
    const effect = item.useEffect;
    if (!effect || !meetsUseTrigger(trigger, combatant, context)) return;
    if (!repeatable && combatant.usedUseableIds && combatant.usedUseableIds.has(item.id)) {
      entry.used = true;
      return;
    }
    const chance = typeof effect.chance === 'number' ? effect.chance : null;
    if (Number.isFinite(chance) && chance >= 0 && chance <= 1) {
      if (Math.random() > chance) {
        return;
      }
    }
    const verb = item.useConsumed ? 'consumes' : 'activates';
    pushLog(log, `${combatant.character.name} ${verb} ${item.name}`, {
      sourceId: combatant.character.id,
      targetId: combatant.character.id,
      kind: 'useable',
      itemId: item.id,
    });
    const target = item.useTarget === 'enemy' ? enemy : combatant;
    const baseResolution =
      context && context.resolution && context.resolution.hit ? context.resolution : null;
    const effectContext = {
      ...context,
      resolution: baseResolution ? { ...baseResolution } : { hit: true },
      enemy: target === enemy ? enemy || target : enemy,
      source: combatant,
      actor: context && context.actor ? context.actor : combatant,
      targetCombatant: target || combatant,
    };
    if (target === enemy && context.damageType && !effectContext.resolution.damageType) {
      effectContext.resolution.damageType = context.damageType;
    }
    applyEffect(combatant, target || combatant, effect, now, log, effectContext);
    if (!repeatable) {
      entry.used = true;
      if (combatant.usedUseableIds && item) {
        combatant.usedUseableIds.add(item.id);
      }
      if (item.useConsumed) {
        combatant.consumedUseables.push({ slot: entry.slot, itemId: item.id });
      }
    } else {
      entry.activationCount = (entry.activationCount || 0) + 1;
    }
  });
}

function handleDamageTaken(victim, attacker, damageType, amount, now, log) {
  if (!victim || !Number.isFinite(amount) || amount <= 0) return;
  const context = {
    event: 'damageTaken',
    damageType,
    amount,
    source: attacker,
    target: victim,
  };
  tryUseCombatantItem(victim, attacker, now, log, context);
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
    const effectContext = {
      resolution,
      actor: source,
      target,
      actionType: context && context.actionType ? context.actionType : null,
      consumeDamageBonus: false,
      now,
    };
    const outcome = applyEffect(source, target, effect, now, log, effectContext);
    if (outcome && outcome.hit && Number.isFinite(outcome.amount) && outcome.amount > 0) {
      const resolvedDamageType = outcome.damageType || baseType;
      handleDamageTaken(target, source, resolvedDamageType, outcome.amount, now, log);
    }
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
    const outcome = executeCombatAction(actor, target, now, abilityMap, log);
    const interval = getEffectiveAttackInterval(actor, now, { consume: true });
    nextTimes[idx] += interval;
    const next = Math.min(nextTimes[0], nextTimes[1]);
    const wait = Math.max(0, next - now);
    const newLogs = log && log.length > before ? log.slice(before) : outcome.logs;
    if (onUpdate) onUpdate({ type: 'update', a: state(a), b: state(b), log: newLogs });
    if (!fastForward && a.health > 0 && b.health > 0) {
      await new Promise(res => setTimeout(res, wait * 1000));
    }
  }
  combatants.forEach(combatant => {
    if (!combatant || !Array.isArray(combatant.useables)) return;
    combatant.useables.forEach(entry => {
      if (!entry || !entry.item) return;
      if (!entry.item.useConsumedAfterCombat) return;
      const already = combatant.consumedUseables.some(
        consumed => consumed && consumed.itemId === entry.item.id && consumed.slot === entry.slot,
      );
      if (!already) {
        combatant.consumedUseables.push({ slot: entry.slot, itemId: entry.item.id });
      }
    });
  });
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

function alivePartyMembers(party) {
  return party.filter(member => member && member.health > 0);
}

function threatScore(base, bonus, member) {
  const baseValue = base.get(member) || 0;
  const bonusValue = bonus.get(member) || 0;
  return baseValue + bonusValue;
}

function decayThreat(bonus, party) {
  party.forEach(member => {
    if (!member) return;
    const current = bonus.get(member);
    if (current == null) return;
    bonus.set(member, current * 0.98);
  });
}

async function runDungeonCombat(
  partyChars,
  bossChar,
  abilityMap,
  equipmentMap,
  onUpdateOrOptions,
  maybeOptions,
) {
  let onUpdate = null;
  let options = {};

  if (typeof onUpdateOrOptions === 'function') {
    onUpdate = onUpdateOrOptions;
    options = maybeOptions || {};
  } else if (onUpdateOrOptions && typeof onUpdateOrOptions === 'object') {
    options = onUpdateOrOptions;
  }

  const party = Array.isArray(partyChars)
    ? partyChars.map(character => createCombatant(character, equipmentMap))
    : [];
  const boss = createCombatant(bossChar, equipmentMap);
  const bossNegation = boss && boss.negation ? { ...boss.negation } : null;
  const combatants = [...party, boss];
  const collectLog = options.collectLog !== false;
  const log = collectLog ? [] : null;
  const fastForward = !!options.fastForward;
  const nextTimes = combatants.map(() => 0);
  const baseThreat = new Map();
  const bonusThreat = new Map();
  const partyIds = party.map(member => member.character.id);

  party.forEach(member => {
    const stamina = Number.isFinite(member.derived && member.derived.stamina) ? member.derived.stamina : 0;
    const level = Number.isFinite(member.character && member.character.level)
      ? member.character.level
      : 1;
    const base = stamina * 4 + level * 6;
    baseThreat.set(member, base);
    bonusThreat.set(member, 0);
  });

  let currentTarget = null;
  let now = 0;
  const metrics = {
    damageToParty: 0,
    damageToBoss: 0,
    stunsByParty: 0,
    stunsOnParty: 0,
    partyMembersDowned: 0,
    bossHealthRemaining: boss.derived.health || 0,
    duration: 0,
    threatSwaps: 0,
  };
  if (bossNegation) {
    metrics.bossNegation = {
      meleeBonus: bossNegation.meleeBonus || 0,
      magicBonus: bossNegation.magicBonus || 0,
      targetMeleeBonus: bossNegation.targetMeleeBonus || bossNegation.meleeBonus || 0,
      targetMagicBonus: bossNegation.targetMagicBonus || bossNegation.magicBonus || 0,
      meleeResist: boss.derived.meleeResist,
      magicResist: boss.derived.magicResist,
    };
  }

  const selectBossTarget = previous => {
    const living = alivePartyMembers(party);
    if (!living.length) return null;
    let chosen = null;
    let bestScore = -Infinity;
    living.forEach(member => {
      const score = threatScore(baseThreat, bonusThreat, member);
      const stickyBonus = previous && member === previous ? 1.1 : 1;
      const total = score * stickyBonus;
      if (total > bestScore) {
        bestScore = total;
        chosen = member;
      }
    });
    return chosen;
  };

  if (onUpdate) {
    onUpdate({
      type: 'start',
      mode: 'dungeon',
      party: party.map(state),
      boss: state(boss),
      log: [],
      partyIds,
      bossId: boss.character.id,
    });
  }

  const tryUseablePassives = () => {
    party.forEach(member => {
      if (member.health > 0) {
        tryUseCombatantItem(member, boss, now, log);
      }
    });
    if (boss.health > 0) {
      const candidate = currentTarget && currentTarget.health > 0 ? currentTarget : alivePartyMembers(party)[0] || null;
      if (candidate) {
        tryUseCombatantItem(boss, candidate, now, log);
      }
    }
  };

  while (boss.health > 0 && alivePartyMembers(party).length > 0) {
    tryUseablePassives();

    let actingIndex = -1;
    let soonest = Infinity;
    for (let i = 0; i < combatants.length; i += 1) {
      const combatant = combatants[i];
      if (!combatant || combatant.health <= 0) continue;
      const time = nextTimes[i];
      if (time < soonest) {
        soonest = time;
        actingIndex = i;
      }
    }
    if (actingIndex === -1) break;

    now = nextTimes[actingIndex];

    const snapshots = new Map();
    combatants.forEach(c => {
      if (c && c.health > 0) {
        snapshots.set(c, c.health);
      }
    });

    combatants.forEach(c => {
      if (c && c.health > 0) {
        tick(c, now, log);
      }
    });

    combatants.forEach(c => {
      if (!c) return;
      const before = snapshots.get(c);
      if (!Number.isFinite(before)) return;
      const delta = before - c.health;
      if (delta > 0) {
        if (party.includes(c)) {
          metrics.damageToParty += delta;
        } else if (c === boss) {
          metrics.damageToBoss += delta;
        }
      }
    });

    const actor = combatants[actingIndex];
    if (!actor) {
      nextTimes[actingIndex] = now + 0.1;
      continue;
    }
    if (actor.health <= 0) {
      const interval = getEffectiveAttackInterval(actor, now, { consume: false });
      nextTimes[actingIndex] = now + interval;
      continue;
    }

    let target = null;
    if (actor === boss) {
      const nextTarget = selectBossTarget(currentTarget);
      if (!nextTarget) {
        break;
      }
      if (currentTarget && currentTarget !== nextTarget) {
        metrics.threatSwaps += 1;
      }
      currentTarget = nextTarget;
      target = currentTarget;
    } else {
      target = boss;
    }

    const before = log ? log.length : 0;
    const outcome = executeCombatAction(actor, target, now, abilityMap, log);

    if (actor === boss) {
      outcome.damageEvents.forEach(evt => {
        if (!evt || !evt.target || evt.amount <= 0) return;
        if (party.includes(evt.target)) {
          metrics.damageToParty += evt.amount;
        }
      });
      if (outcome.stunApplied) {
        metrics.stunsOnParty += 1;
      }
      if (target && target.health <= 0) {
        baseThreat.set(target, 0);
        bonusThreat.set(target, -Infinity);
      }
    } else {
      outcome.damageEvents.forEach(evt => {
        if (!evt || evt.amount <= 0) return;
        if (evt.target === boss) {
          metrics.damageToBoss += evt.amount;
          const current = bonusThreat.get(actor) || 0;
          bonusThreat.set(actor, current + evt.amount * 1.1);
        }
      });
      if (outcome.stunApplied) {
        metrics.stunsByParty += 1;
        const base = baseThreat.get(actor) || 0;
        const current = bonusThreat.get(actor) || 0;
        bonusThreat.set(actor, current + Math.max(25, base * 0.6));
      }
      decayThreat(bonusThreat, party.filter(member => member !== actor));
    }

    const interval = getEffectiveAttackInterval(actor, now, { consume: true });
    nextTimes[actingIndex] += interval;
    const newLogs = log && log.length > before ? log.slice(before) : outcome.logs;
    if (onUpdate) {
      onUpdate({
        type: 'update',
        mode: 'dungeon',
        party: party.map(state),
        boss: state(boss),
        log: newLogs,
        partyIds,
        bossId: boss.character.id,
      });
    }

    if (boss.health <= 0 || alivePartyMembers(party).length <= 0) {
      metrics.duration = now;
      break;
    }

    const waitCandidate = combatants.reduce((min, combatant, idx) => {
      if (!combatant || combatant.health <= 0) return min;
      const time = nextTimes[idx];
      return time < min ? time : min;
    }, Infinity);
    const wait = Math.max(0, (Number.isFinite(waitCandidate) ? waitCandidate : now) - now);
    if (!fastForward) {
      await new Promise(res => setTimeout(res, wait * 1000));
    }
  }

  combatants.forEach(combatant => {
    if (!combatant || !Array.isArray(combatant.useables)) return;
    combatant.useables.forEach(entry => {
      if (!entry || !entry.item) return;
      if (!entry.item.useConsumedAfterCombat) return;
      const already = combatant.consumedUseables.some(
        consumed => consumed && consumed.itemId === entry.item.id && consumed.slot === entry.slot,
      );
      if (!already) {
        combatant.consumedUseables.push({ slot: entry.slot, itemId: entry.item.id });
      }
    });
  });

  const remainingParty = alivePartyMembers(party);
  const winnerSide = boss.health > 0 ? 'boss' : 'party';
  const winnerId =
    winnerSide === 'boss'
      ? boss.character.id
      : (remainingParty[0] && remainingParty[0].character.id) || (party[0] && party[0].character.id);

  metrics.partyMembersDowned = party.filter(member => member.health <= 0).length;
  metrics.bossHealthRemaining = Math.max(0, boss.health);
  metrics.duration = now;

  const consumedUseables = {};
  party.forEach(member => {
    consumedUseables[member.character.id] = member.consumedUseables.slice();
  });
  consumedUseables[boss.character.id] = boss.consumedUseables.slice();

  return {
    winnerSide,
    winnerId,
    log: log || [],
    duration: now,
    finalParty: party.map(state),
    finalBoss: state(boss),
    consumedUseables,
    metrics,
  };
}

module.exports = { runCombat, runDungeonCombat };
