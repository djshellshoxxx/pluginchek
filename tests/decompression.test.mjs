import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateRawSync } from 'node:zlib';
import { decompressBounded, MAX_DECOMPRESSED_BYTES } from '../decompression.js';

test('decodes legitimate gzip and deflate content', async () => {
  const payload = new TextEncoder().encode('plugin=Synth\n'.repeat(100));
  for (const [format, compressed] of [['gzip', gzipSync(payload)], ['deflate-raw', deflateRawSync(payload)]]) {
    const decoded = await decompressBounded(new Uint8Array(compressed), format, payload.length);
    assert.deepEqual(decoded, payload);
  }
});
test('rejects compressed content expanding beyond the supplied cap', async () => {
  const compressed = new Uint8Array(gzipSync(Buffer.alloc(128 * 1024, 65)));
  await assert.rejects(decompressBounded(compressed, 'gzip', 4096), /limit/);
});
test('rejects invalid limits', async () => {
  await assert.rejects(decompressBounded(new Uint8Array(), 'gzip', MAX_DECOMPRESSED_BYTES + 1), /limit/);
});
