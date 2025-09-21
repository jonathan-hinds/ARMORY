const characterModelPath = require.resolve('../../models/Character');

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

function clearFakeDocs() {
  docs.clear();
}

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

module.exports = {
  FakeCharacterDoc,
  setFakeCharacterDoc,
  clearFakeDocs,
};
