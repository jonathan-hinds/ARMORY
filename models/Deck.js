const mongoose = require('mongoose');

const cardEntrySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const deckSchema = new mongoose.Schema(
  {
    deckId: { type: Number, unique: true, index: true, required: true },
    playerId: { type: Number, index: true, required: true },
    name: { type: String, required: true },
    cards: { type: [cardEntrySchema], default: [] },
  },
  { timestamps: true }
);

deckSchema.index({ playerId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Deck', deckSchema);
