import { test } from 'node:test';
import assert from 'node:assert';
import { mapLimit } from './utils.mjs';

test('mapLimit: maps items correctly', async () => {
  const items = [1, 2, 3, 4, 5];
  const result = await mapLimit(items, 2, async (x) => x * 2);
  assert.deepStrictEqual(result, [2, 4, 6, 8, 10]);
});

test('mapLimit: handles empty array', async () => {
  const items = [];
  const result = await mapLimit(items, 2, async (x) => x * 2);
  assert.deepStrictEqual(result, []);
});

test('mapLimit: respects concurrency limit', async () => {
  const items = [1, 2, 3, 4, 5];
  let active = 0;
  let maxActive = 0;
  const limit = 2;

  await mapLimit(items, limit, async (x) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return x;
  });

  assert.strictEqual(maxActive, limit, `Expected max concurrency of ${limit}, but got ${maxActive}`);
});

test('mapLimit: propagates errors', async () => {
  const items = [1, 2, 3];
  await assert.rejects(
    () => mapLimit(items, 2, async (x) => {
      if (x === 2) throw new Error('Test error');
      return x;
    }),
    { message: 'Test error' }
  );
});
