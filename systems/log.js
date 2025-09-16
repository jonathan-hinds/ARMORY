function createLogEntry(message, meta = {}) {
  const { sourceId = null, targetId = null, kind = null, ...rest } = meta;
  return { message, sourceId, targetId, kind, ...rest };
}

function pushLog(log, message, meta) {
  if (!log || typeof log.push !== 'function') return null;
  log.push(createLogEntry(message, meta));
  return log;
}

module.exports = { createLogEntry, pushLog };
