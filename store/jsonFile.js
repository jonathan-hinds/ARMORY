const fs = require('fs/promises');
const path = require('path');

async function readJson(file) {
  const data = await fs.readFile(path.resolve(__dirname, '..', 'data', file), 'utf8').catch(() => 'null');
  return JSON.parse(data || 'null');
}

async function writeJson(file, data) {
  const tmp = path.resolve(__dirname, '..', 'data', file + '.tmp');
  const dest = path.resolve(__dirname, '..', 'data', file);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, dest);
}

module.exports = { readJson, writeJson };
