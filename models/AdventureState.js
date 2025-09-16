const mongoose = require('mongoose');

const adventureStateSchema = new mongoose.Schema(
  {
    characterId: { type: Number, required: true, unique: true, index: true },
    active: { type: Boolean, default: false },
    startedAt: { type: Number, default: null },
    endsAt: { type: Number, default: null },
    dayDurationMs: { type: Number, default: 0 },
    totalDays: { type: Number, default: 1 },
    nextEventAt: { type: Number, default: null },
    events: { type: [mongoose.Schema.Types.Mixed], default: () => [] },
    history: { type: [mongoose.Schema.Types.Mixed], default: () => [] },
    finalized: { type: Boolean, default: true },
    outcome: { type: String, default: null },
    ga: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ round: 1, parentA: null, parentB: null }),
    },
    completedAt: { type: Number, default: null },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { minimize: false }
);

module.exports = mongoose.model('AdventureState', adventureStateSchema);
