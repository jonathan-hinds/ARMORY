const CardSchool = Object.freeze({
  BLOOD: 'BLOOD',
  FROST: 'FROST',
  FLAME: 'FLAME',
  STORM: 'STORM',
  EARTH: 'EARTH',
  VOID: 'VOID',
  LIGHT: 'LIGHT',
});

const CardType = Object.freeze({
  ATTACK: 'ATTACK',
  SPELL_ATTACK: 'SPELL_ATTACK',
  SPELL_SKILL: 'SPELL_SKILL',
  REACTION: 'REACTION',
  SUPPORT: 'SUPPORT',
});

const Rarity = Object.freeze({
  COMMON: 'COMMON',
  UNCOMMON: 'UNCOMMON',
  RARE: 'RARE',
  LEGENDARY: 'LEGENDARY',
});

const ResourceType = Object.freeze({
  MANA: 'MANA',
  VITALITY: 'VITALITY',
  CHANNEL: 'CHANNEL',
  FOCUS: 'FOCUS',
});

const TargetType = Object.freeze({
  SELF: 'SELF',
  ENEMY: 'ENEMY',
  ALLY: 'ALLY',
  ALL_ENEMIES: 'ALL_ENEMIES',
  ALL_ALLIES: 'ALL_ALLIES',
  ANY: 'ANY',
});

const EffectType = Object.freeze({
  DEAL_DAMAGE: 'DEAL_DAMAGE',
  LOSE_RESOURCE: 'LOSE_RESOURCE',
  GAIN_RESOURCE: 'GAIN_RESOURCE',
  APPLY_STATUS: 'APPLY_STATUS',
  DRAW: 'DRAW',
  CHANNEL: 'CHANNEL',
  SHIELD: 'SHIELD',
  SUMMON: 'SUMMON',
  DISCARD: 'DISCARD',
  MILL: 'MILL',
  COPY: 'COPY',
  CLEANSE: 'CLEANSE',
  BUFF: 'BUFF',
  DEBUFF: 'DEBUFF',
  REPEAT_NEXT: 'REPEAT_NEXT',
});

const Keyword = Object.freeze({
  CHANNEL: 'CHANNEL',
  EXHAUST: 'EXHAUST',
  QUICK: 'QUICK',
  OVERLOAD: 'OVERLOAD',
  LINGER: 'LINGER',
});

module.exports = {
  CardSchool,
  CardType,
  Rarity,
  ResourceType,
  TargetType,
  EffectType,
  Keyword,
};
