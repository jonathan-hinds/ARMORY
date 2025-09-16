const mongoose = require('mongoose');

const challengeStateSchema = new mongoose.Schema(
  {
    characterId: { type: Number, required: true, unique: true, index: true },
    round: { type: Number, default: 1 },
    parentA: { type: mongoose.Schema.Types.Mixed, default: null },
    parentB: { type: mongoose.Schema.Types.Mixed, default: null },
    currentOpponent: { type: mongoose.Schema.Types.Mixed, default: null },
    lastOutcome: { type: String, default: null },
    lastReward: { type: mongoose.Schema.Types.Mixed, default: null },
    lastMetrics: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { minimize: false }
);

module.exports = mongoose.model('ChallengeState', challengeStateSchema);
