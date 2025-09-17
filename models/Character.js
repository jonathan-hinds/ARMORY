const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema(
  {
    weapon: { type: String, default: null },
    helmet: { type: String, default: null },
    chest: { type: String, default: null },
    legs: { type: String, default: null },
    feet: { type: String, default: null },
    hands: { type: String, default: null },
  },
  { _id: false }
);

const useableSchema = new mongoose.Schema(
  {
    useable1: { type: String, default: null },
    useable2: { type: String, default: null },
  },
  { _id: false }
);

const attributesSchema = new mongoose.Schema(
  {
    strength: { type: Number, default: 0 },
    stamina: { type: Number, default: 0 },
    agility: { type: Number, default: 0 },
    intellect: { type: Number, default: 0 },
    wisdom: { type: Number, default: 0 },
  },
  { _id: false }
);

const characterSchema = new mongoose.Schema(
  {
    characterId: { type: Number, unique: true, index: true, required: true },
    playerId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    attributes: { type: attributesSchema, default: () => ({}) },
    basicType: { type: String, enum: ['melee', 'magic'], required: true },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    rotation: { type: [Number], default: [] },
    equipment: { type: equipmentSchema, default: () => ({}) },
    useables: { type: useableSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Character', characterSchema);
