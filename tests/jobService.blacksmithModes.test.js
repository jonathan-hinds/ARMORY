const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FakeCharacterDoc,
  setFakeCharacterDoc,
  clearFakeDocs,
} = require('./helpers/fakeCharacterModel');

const { setBlacksmithTask } = require('../systems/jobService');

function buildWorkingBlacksmith() {
  const now = new Date().toISOString();
  return new FakeCharacterDoc({
    playerId: 1,
    characterId: 10,
    name: 'Working Smith',
    basicType: 'melee',
    attributes: { strength: 12, stamina: 6, agility: 4, intellect: 2, wisdom: 1 },
    level: 2,
    xp: 100,
    rotation: [],
    equipment: {},
    useables: {},
    gold: 25,
    items: [],
    materials: {},
    job: {
      jobId: 'blacksmith',
      startedAt: now,
      lastProcessedAt: now,
      isWorking: true,
      workingSince: now,
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

test('setBlacksmithTask allows changing modes while on the clock', async () => {
  clearFakeDocs();
  const doc = buildWorkingBlacksmith();
  setFakeCharacterDoc(doc);

  const status = await setBlacksmithTask(1, 10, 'salvage');

  assert.equal(doc.job.isWorking, true);
  assert.equal(doc.job.shiftSelections.blacksmith, 'salvage');
  assert.equal(doc.job.blacksmith.modeId, 'salvage');
  assert.equal(doc.job.blacksmith.task, 'salvage');
  assert.ok(doc._modified.has('job'));
  assert.ok(doc._modified.has('job.shiftSelections'));

  assert.ok(status?.activeJob);
  assert.equal(status.activeJob.isWorking, true);
  assert.equal(status.activeJob.activeShiftModeId, 'salvage');
  assert.equal(status.activeJob.blacksmith.modeId, 'salvage');
  assert.equal(status.activeJob.blacksmith.task, 'salvage');
});
