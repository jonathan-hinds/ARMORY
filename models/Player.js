const mongoose = require('mongoose');

const materialsSchema = new mongoose.Schema({}, { _id: false, strict: false });

const stashEquipmentSchema = new mongoose.Schema({}, { _id: false, strict: false });

const stashSchema = new mongoose.Schema(
  {
    gold: { type: Number, default: 0 },
    equipmentSlots: { type: Number, default: 5 },
    equipment: { type: stashEquipmentSchema, default: () => ({}) },
    materials: { type: materialsSchema, default: () => ({}) },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: Number, unique: true, index: true, required: true },
    name: { type: String, required: true },
    characterId: { type: Number, default: null },
    stash: { type: stashSchema, default: () => ({}) },
  },
  { timestamps: true }
);

playerSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Player', playerSchema);
