const fs = require('fs').promises;
const path = require('path');
const CardModel = require('../models/Card');
const {
  CardSchool,
  CardType,
  Rarity,
  ResourceType,
  TargetType,
  EffectType,
  Keyword,
} = require('../domain/cardEnums');

const CARD_DATA_PATH = path.join(__dirname, '..', 'data', 'cards.json');
let seedPromise = null;

function ensureEnum(value, allowed, label) {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function normalizeEffects(effects = []) {
  if (!Array.isArray(effects)) return [];
  return effects.map(effect => {
    const id = ensureEnum(String(effect.id || '').trim(), Object.values(EffectType), 'effect');
    const normalized = {
      id,
      target: effect.target && Object.values(TargetType).includes(effect.target)
        ? effect.target
        : TargetType.ENEMY,
      amount: Number(effect.amount) || 0,
    };
    if (effect.resource && Object.values(ResourceType).includes(effect.resource)) {
      normalized.resource = effect.resource;
    }
    if (typeof effect.status === 'string' && effect.status.trim()) {
      normalized.status = effect.status.trim();
    }
    if (typeof effect.stat === 'string' && effect.stat.trim()) {
      normalized.stat = effect.stat.trim();
    }
    if (typeof effect.condition === 'string' && effect.condition.trim()) {
      normalized.condition = effect.condition.trim();
    }
    return normalized;
  });
}

function normalizeCardDefinition(def) {
  const slug = String(def.slug || '').trim();
  if (!slug) {
    throw new Error('card slug required');
  }
  const school = ensureEnum(String(def.school || '').trim(), Object.values(CardSchool), 'school');
  const type = ensureEnum(String(def.type || '').trim(), Object.values(CardType), 'type');
  const rarity = ensureEnum(String(def.rarity || Rarity.COMMON).trim(), Object.values(Rarity), 'rarity');
  const cost = def.cost || {};
  const resource = ensureEnum(String(cost.resource || '').trim(), Object.values(ResourceType), 'cost.resource');
  const amount = Number(cost.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('cost.amount must be non-negative');
  }
  const tags = Array.isArray(def.tags) ? def.tags.map(t => String(t)) : [];
  const keywords = Array.isArray(def.keywords)
    ? def.keywords.filter(k => Object.values(Keyword).includes(k))
    : [];

  return {
    slug,
    name: String(def.name || slug),
    school,
    type,
    rarity,
    cost: { resource, amount },
    tags,
    keywords,
    effects: normalizeEffects(def.effects),
    text: String(def.text || ''),
    role: String(def.role || ''),
  };
}

async function loadCardData() {
  const raw = await fs.readFile(CARD_DATA_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('cards.json must export an array');
  }
  return data.map(normalizeCardDefinition);
}

async function seedCardCatalog() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const cards = await loadCardData();
    const ops = cards.map(card =>
      CardModel.findOneAndUpdate({ slug: card.slug }, { $set: card }, { upsert: true, new: true })
    );
    await Promise.all(ops);
    return cards.length;
  })();
  return seedPromise;
}

async function listCards() {
  await seedCardCatalog();
  return CardModel.find().sort({ name: 1 }).lean();
}

module.exports = {
  seedCardCatalog,
  listCards,
  enums: { CardSchool, CardType, Rarity, ResourceType, TargetType, EffectType, Keyword },
};
