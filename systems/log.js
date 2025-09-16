function createLogEntry(message, meta = {}) {
  const { sourceId = null, targetId = null, kind = null, ...rest } = meta;
  return { message, sourceId, targetId, kind, ...rest };
}

function pushLog(log, message, meta) {
  log.push(createLogEntry(message, meta));
}

module.exports = { createLogEntry, pushLog };
