const test = require('node:test');
const assert = require('node:assert/strict');

function createStubElement() {
  const element = {
    children: [],
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
      }
      return child;
    },
    replaceChildren(...kids) {
      this.children = [...kids];
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    dispatchEvent() { return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains() { return false; },
    cloneNode() { return createStubElement(); },
    getBoundingClientRect() {
      return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 };
    },
    focus() {},
    blur() {},
    scrollIntoView() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
  };
  return element;
}

const elementStore = new Map();
function getElementById(id) {
  if (!elementStore.has(id)) {
    elementStore.set(id, createStubElement());
  }
  return elementStore.get(id);
}

global.window = global;
global.alert = () => {};
global.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
  clear() {},
};

global.document = {
  body: createStubElement(),
  createElement: () => createStubElement(),
  createDocumentFragment: () => ({
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  }),
  createTextNode: text => ({ textContent: String(text || '') }),
  getElementById,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
};

global.performance = global.performance || { now: () => 0 };

const {
  __testing: {
    clearJobStatusCache,
    handleSetJobShiftMode,
    loadJobStatus,
    setJobContext,
    setJobStatusCache,
    getJobStatusCache,
  },
} = require('../ui/main.js');

test('blacksmith mode buttons still work after cache invalidation', async () => {
  setJobContext({ id: 7 }, {
    id: 42,
    name: 'Test Smith',
    basicType: 'melee',
    job: {
      jobId: 'blacksmith',
      startedAt: null,
      lastProcessedAt: null,
      workingSince: null,
      isWorking: false,
    },
  });

  const forgeStatus = {
    id: 'blacksmith',
    name: 'Blacksmith',
    isWorking: false,
    activeShiftModeId: 'forge',
    blacksmith: { modeId: 'forge', task: 'craft', salvageQueue: [] },
  };

  setJobStatusCache({
    activeJob: forgeStatus,
    jobs: [{ id: 'blacksmith', name: 'Blacksmith' }],
  });

  clearJobStatusCache();
  assert.equal(getJobStatusCache(), null);

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/characters/42/job/blacksmith/task') {
      const payload = options.body ? JSON.parse(options.body) : {};
      assert.equal(payload.playerId, 7);
      assert.equal(payload.mode, 'salvage');
      return {
        ok: true,
        async json() {
          return {
            activeJob: {
              ...forgeStatus,
              activeShiftModeId: 'salvage',
              blacksmith: { modeId: 'salvage', task: 'salvage', salvageQueue: [] },
            },
          };
        },
      };
    }
    if (url === '/players/7/inventory?characterId=42') {
      return {
        ok: true,
        async json() {
          return {
            character: {
              id: 42,
              basicType: 'melee',
              job: {
                jobId: 'blacksmith',
                startedAt: null,
                lastProcessedAt: null,
                workingSince: null,
                isWorking: false,
              },
            },
            useables: {},
            materials: [],
            gold: 0,
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {};
      },
    };
  };

  const container = createStubElement();
  const button = createStubElement();

  await handleSetJobShiftMode('salvage', forgeStatus, container, button);

  assert.ok(requests.some(req => req.url === '/characters/42/job/blacksmith/task'));
  const status = getJobStatusCache();
  assert.ok(status);
  assert.equal(status.activeJob.blacksmith.modeId, 'salvage');
  assert.equal(status.activeJob.activeShiftModeId, 'salvage');
});
