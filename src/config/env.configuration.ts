export default () => ({
  NODE_ENV: process.env.NODE_ENV,
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
    cacheTTL: process.env.CACHE_TTL,
  },
});
