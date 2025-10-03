const mongoose = require('mongoose');

const AttributeSchema = new mongoose.Schema(
  {
    strength: { type: Number, default: 0 },
    stamina: { type: Number, default: 0 },
    agility: { type: Number, default: 0 },
    intellect: { type: Number, default: 0 },
    wisdom: { type: Number, default: 0 },
  },
  { _id: false }
);

const EnemyTemplateSchema = new mongoose.Schema(
  {
    templateId: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    basicType: { type: String, default: 'melee', trim: true },
    level: { type: Number, default: 1 },
    attributes: { type: AttributeSchema, default: () => ({}) },
    rotation: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    equipment: {
      type: Map,
      of: String,
      default: () => ({}),
    },
    xpPct: { type: Number, default: 0 },
    gold: { type: Number, default: 0 },
    spawnChance: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('EnemyTemplate', EnemyTemplateSchema);
