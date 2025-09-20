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

const materialsSchema = new mongoose.Schema({}, { _id: false, strict: false });

const flexibleNumberMapSchema = new mongoose.Schema({}, { _id: false, strict: false });

const jobMissingSchema = new mongoose.Schema(
  {
    materialId: { type: String, required: true },
    required: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
  },
  { _id: false }
);

const jobGeneratedMaterialSchema = new mongoose.Schema(
  {
    materialId: { type: String, required: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const jobLogEntrySchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['crafted', 'failed'], required: true },
    itemId: { type: String, default: null },
    itemName: { type: String, default: null },
    rarity: { type: String, default: null },
    stat: { type: String, default: null },
    statAmount: { type: Number, default: 0 },
    reason: { type: String, default: null },
    missing: { type: [jobMissingSchema], default: undefined },
    materials: { type: materialsSchema, default: () => ({}) },
    generatedMaterials: { type: [jobGeneratedMaterialSchema], default: undefined },
    generationAttempted: { type: Boolean, default: false },
    generationSucceeded: { type: Boolean, default: false },
    generationChance: { type: Number, default: null },
    generationShare: { type: Number, default: null },
    generationMultiplier: { type: Number, default: null },
    generationRoll: { type: Number, default: null },
    generationAttribute: { type: String, default: null },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    jobId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    lastProcessedAt: { type: Date, default: null },
    isWorking: { type: Boolean, default: false },
    workingSince: { type: Date, default: null },
    totalAttempts: { type: Number, default: 0 },
    totalCrafted: { type: Number, default: 0 },
    totalStatGain: { type: Number, default: 0 },
    statGains: { type: flexibleNumberMapSchema, default: () => ({}) },
    totalsByItem: { type: flexibleNumberMapSchema, default: () => ({}) },
    log: { type: [jobLogEntrySchema], default: [] },
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
    gold: { type: Number, default: 0 },
    items: { type: [String], default: [] },
    materials: { type: materialsSchema, default: () => ({}) },
    job: { type: jobSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Character', characterSchema);
