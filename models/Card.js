const mongoose = require('mongoose');
const {
  CardSchool,
  CardType,
  Rarity,
  ResourceType,
  TargetType,
  EffectType,
  Keyword,
} = require('../domain/cardEnums');

const effectSchema = new mongoose.Schema(
  {
    id: { type: String, enum: Object.values(EffectType), required: true },
    target: { type: String, enum: Object.values(TargetType), default: TargetType.ENEMY },
    amount: { type: Number, default: 0 },
    resource: { type: String, enum: Object.values(ResourceType) },
    status: { type: String, trim: true },
    stat: { type: String, trim: true },
    condition: { type: String, trim: true },
  },
  { _id: false }
);

const costSchema = new mongoose.Schema(
  {
    resource: { type: String, enum: Object.values(ResourceType), required: true },
    amount: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    school: { type: String, enum: Object.values(CardSchool), required: true },
    type: { type: String, enum: Object.values(CardType), required: true },
    rarity: { type: String, enum: Object.values(Rarity), default: Rarity.COMMON },
    cost: { type: costSchema, required: true },
    tags: { type: [String], default: [] },
    keywords: { type: [String], enum: Object.values(Keyword), default: [] },
    effects: { type: [effectSchema], default: [] },
    text: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', cardSchema);
