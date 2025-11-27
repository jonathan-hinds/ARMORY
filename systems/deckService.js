const DeckModel = require('../models/Deck');
const CardModel = require('../models/Card');
const { seedCardCatalog } = require('./cardService');

const MAX_DECK_SIZE = 30;

async function getNextDeckId() {
  const latest = await DeckModel.findOne().sort({ deckId: -1 }).select('deckId').lean();
  if (!latest || typeof latest.deckId !== 'number') {
    return 1;
  }
  return latest.deckId + 1;
}

async function ensureCardCatalog() {
  await seedCardCatalog();
}

async function listDecks(playerId) {
  const pid = parseInt(playerId, 10);
  if (!Number.isFinite(pid)) {
    throw new Error('playerId required');
  }
  return DeckModel.find({ playerId: pid }).sort({ updatedAt: -1 }).lean();
}

function normalizeDeckCards(cards) {
  if (!Array.isArray(cards)) return [];
  const counts = new Map();
  cards.forEach(slug => {
    const key = String(slug || '').trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([slug, quantity]) => ({ slug, quantity }));
}

async function saveDeck(playerId, name, cardSlugs) {
  const pid = parseInt(playerId, 10);
  if (!Number.isFinite(pid)) {
    throw new Error('playerId required');
  }
  const deckName = String(name || '').trim();
  if (!deckName) {
    throw new Error('deck name required');
  }
  await ensureCardCatalog();
  const normalizedCards = normalizeDeckCards(cardSlugs);
  const totalCards = normalizedCards.reduce((sum, c) => sum + c.quantity, 0);
  if (totalCards > MAX_DECK_SIZE) {
    throw new Error(`deck cannot exceed ${MAX_DECK_SIZE} cards`);
  }
  const catalog = await CardModel.find({ slug: { $in: normalizedCards.map(c => c.slug) } })
    .select('slug')
    .lean();
  const catalogSlugs = new Set(catalog.map(c => c.slug));
  normalizedCards.forEach(entry => {
    if (!catalogSlugs.has(entry.slug)) {
      throw new Error(`unknown card slug: ${entry.slug}`);
    }
  });

  const existing = await DeckModel.findOne({ playerId: pid, name: deckName }).collation({
    locale: 'en',
    strength: 2,
  });
  if (existing) {
    existing.cards = normalizedCards;
    await existing.save();
    return existing.toObject();
  }
  const deckId = await getNextDeckId();
  const deck = await DeckModel.create({ deckId, playerId: pid, name: deckName, cards: normalizedCards });
  return deck.toObject();
}

module.exports = { listDecks, saveDeck, MAX_DECK_SIZE };
