const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: Number, unique: true, index: true, required: true },
    name: { type: String, required: true },
    gold: { type: Number, default: 0 },
    items: { type: [String], default: [] },
    characterId: { type: Number, default: null },
  },
  { timestamps: true }
);

playerSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Player', playerSchema);
