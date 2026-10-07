function decodeEmbeddingBlob(blob) {
  if (!blob) return [];
  try {
    if (Buffer.isBuffer(blob)) {
      const float32 = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      return Array.from(float32);
    }
  } catch (_) {}
  return [];
}

module.exports = { decodeEmbeddingBlob };