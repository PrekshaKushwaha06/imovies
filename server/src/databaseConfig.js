export function resolveMongoUri({ nodeEnv = process.env.NODE_ENV, mongoUri = process.env.MONGODB_URI } = {}) {
  const configuredUri = typeof mongoUri === 'string' ? mongoUri.trim() : '';
  if (configuredUri) return configuredUri;
  if (nodeEnv === 'production') throw new Error('MONGODB_URI is required in production.');
  return 'mongodb://127.0.0.1:27017/imovies';
}
