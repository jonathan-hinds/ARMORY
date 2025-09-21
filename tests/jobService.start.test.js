const test = require('node:test');
const assert = require('node:assert/strict');

class FakeCharacterDoc {
  constructor(data) {
    Object.assign(this, JSON.parse(JSON.stringify(data)));
    this._modified = new Set();
    this._saveCount = 0;
  }

  markModified(field) {
    if (field) {
      this._modified.add(field);
    }
  }

  async save() {
    this._saveCount += 1;
    return this;
  }

  toObject() {
    const {
      markModified,
      save,
      toObject,
      _modified,
      _saveCount,
      ...rest
    } = this;
    return JSON.parse(JSON.stringify(rest));
  }
}

const docs = new Map();

function setFakeCharacterDoc(doc) {
  const key = `${doc.playerId}:${doc.characterId}`;
  docs.set(key, doc);
}

const characterModelPath = require.resolve('../models/Character');
require.cache[characterModelPath] = {
  id: characterModelPath,
  filename: characterModelPath,
  loaded: true,
  exports: {
    async findOne(query = {}) {
      const playerId = Number(query.playerId ?? query.playerID);
      const characterId = Number(query.characterId ?? query.characterID);
      if (!Number.isFinite(playerId) || !Number.isFinite(characterId)) {
        return null;
      }
      const key = `${playerId}:${characterId}`;
      return docs.get(key) || null;
    },
  },
};

const { startJobWork } = require('../systems/jobService');

function buildBaseCharacter() {
  return new FakeCharacterDoc({
    playerId: 1,
    characterId: 10,
    name: 'Test Blacksmith',
    basicType: 'melee',
    attributes: { strength: 10, stamina: 5, agility: 5, intellect: 1, wisdom: 1 },
    level: 1,
    xp: 0,
    rotation: [],
    equipment: {},
    useables: {},
    gold: 0,
    items: [],
    materials: {},
    job: {
      jobId: 'blacksmith',
      startedAt: null,
      lastProcessedAt: null,
      isWorking: false,
      workingSince: null,
      totalAttempts: 0,
      totalCrafted: 0,
      totalStatGain: 0,
      statGains: {},
      totalsByItem: {},
      log: [],
      shiftSelections: { blacksmith: 'forge' },
      blacksmith: { task: 'craft', salvageQueue: [], modeId: 'forge' },
    },
  });
}

test('POST /characters/:id/job/start honors explicit modeId selection changes', async () => {
  docs.clear();
  const doc = buildBaseCharacter();
  setFakeCharacterDoc(doc);

  const salvageStatus = await startJobWork(1, 10, { modeId: 'salvage' });

  assert.equal(doc.job.shiftSelections.blacksmith, 'salvage');
  assert.equal(doc.job.blacksmith.modeId, 'salvage');
  assert.equal(doc.job.blacksmith.task, 'salvage');
  assert.ok(salvageStatus?.activeJob);
  assert.equal(salvageStatus.activeJob.activeShiftModeId, 'salvage');
  assert.equal(salvageStatus.activeJob.blacksmith.modeId, 'salvage');
  assert.equal(salvageStatus.activeJob.blacksmith.task, 'salvage');

  const forgeStatus = await startJobWork(1, 10, { modeId: 'forge' });

  assert.equal(doc.job.shiftSelections.blacksmith, 'forge');
  assert.equal(doc.job.blacksmith.modeId, 'forge');
  assert.equal(doc.job.blacksmith.task, 'craft');
  assert.ok(forgeStatus?.activeJob);
  assert.equal(forgeStatus.activeJob.activeShiftModeId, 'forge');
  assert.equal(forgeStatus.activeJob.blacksmith.modeId, 'forge');
  assert.equal(forgeStatus.activeJob.blacksmith.task, 'craft');
});
