const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({}, { _id: false, strict: false });

const spotSchema = new mongoose.Schema(
  {
    spotId: { type: Number, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    occupantId: { type: Number, default: null },
    occupantName: { type: String, default: null },
    occupantLevel: { type: Number, default: null },
    battlePoints: { type: Number, default: 0 },
    claimedAt: { type: Date, default: null },
    lockedSince: { type: Date, default: null },
    snapshot: { type: snapshotSchema, default: null },
    challengeId: { type: Number, default: null },
  },
  { _id: false }
);

const participantSchema = new mongoose.Schema(
  {
    characterId: { type: Number, required: true },
    name: { type: String, default: null },
    level: { type: Number, default: null },
    points: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: null },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    eventId: { type: Number, required: true },
    winnerId: { type: Number, default: null },
    winnerName: { type: String, default: null },
    pot: { type: Number, default: 0 },
    endedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const battlefieldEventSchema = new mongoose.Schema(
  {
    eventId: { type: Number, default: 1 },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: Date.now },
    nextAwardAt: { type: Date, default: Date.now },
    entryCost: { type: Number, default: 0 },
    pot: { type: Number, default: 0 },
    spots: { type: [spotSchema], default: [] },
    participants: { type: [participantSchema], default: [] },
    history: { type: [historySchema], default: [] },
    lastProcessedAt: { type: Date, default: Date.now },
    configVersion: { type: Number, default: 0 },
  },
  { minimize: false }
);

module.exports = mongoose.model('BattlefieldEvent', battlefieldEventSchema);
