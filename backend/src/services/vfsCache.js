const { LRUCache } = require('lru-cache');
const fsp = require('fs').promises;

const fileCache = new LRUCache({
  max: 500, // keep max 500 files in memory
  maxSize: 50 * 1024 * 1024, // 50MB max total memory
  sizeCalculation: (value, key) => value.length || 1,
  ttl: 1000 * 60 * 5 // 5 min TTL
});

async function readFileCached(filePath, encoding = 'utf8') {
  const cacheKey = `${filePath}:${encoding}`;
  if (fileCache.has(cacheKey)) {
    return fileCache.get(cacheKey);
  }
  const data = await fsp.readFile(filePath, encoding);
  fileCache.set(cacheKey, data);
  return data;
}

module.exports = { readFileCached, fileCache };
