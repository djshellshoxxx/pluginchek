/**
 * Bounded browser decompression for untrusted DAW project containers.
 * Enforce limits while reading rather than after allocating the entire output.
 */
export const MAX_DECOMPRESSED_BYTES = 60_000_000;

export async function decompressBounded(bytes, format, maxBytes = MAX_DECOMPRESSED_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_DECOMPRESSED_BYTES) {
    throw new RangeError('Invalid decompression limit');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - size) {
        await reader.cancel('Decompressed data exceeds size limit');
        throw new RangeError('Decompressed data exceeds size limit');
      }
      size += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
