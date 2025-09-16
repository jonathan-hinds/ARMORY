const mongoose = require('mongoose');
const { mongoUri: configMongoUri } = require('./mongoConfig');

let connectionPromise = null;
const PLACEHOLDER = 'REPLACE_WITH_YOUR_MONGO_URI';

function resolveMongoUri() {
  const envUri = (process.env.MONGO_URI || '').trim();
  if (envUri) {
    return envUri;
  }

  const fallback = (configMongoUri || '').trim();
  if (fallback && fallback !== PLACEHOLDER) {
    return fallback;
  }

  throw new Error(
    'Mongo connection string not configured. Set the MONGO_URI environment variable or update mongoConfig.js.'
  );
}

async function connectDB() {
  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = resolveMongoUri();

  connectionPromise = mongoose
    .connect(uri)
    .then(conn => {
      return conn;
    })
    .catch(err => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}

module.exports = connectDB;
module.exports.resolveMongoUri = resolveMongoUri;
