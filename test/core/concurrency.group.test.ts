import { runAtConcurrency } from '../../src/core/concurrency';

const gate = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('runAtConcurrency message groups', () => {
  it('returns without invoking the handler when items is empty', async () => {
    const fn = jest.fn(async () => {});
    await runAtConcurrency([], 2, fn, () => 'A');
    expect(fn).not.toHaveBeenCalled();
  });

  it('walks items in order when concurrency is sequential', async () => {
    const seen: string[] = [];
    await runAtConcurrency(['a', 'b', 'c'], 1, async (item) => {
      seen.push(item);
    }, () => 'same');
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('runs different groups together and one group at a time', async () => {
    const releaseA = gate();
    const aStarted = gate();
    const bStarted = gate();
    let inGroupA = 0;
    let maxInGroupA = 0;
    const seen: string[] = [];
    const items = [
      { id: 'a1', group: 'A' },
      { id: 'a2', group: 'A' },
      { id: 'b1', group: 'B' },
    ];

    const pending = runAtConcurrency(items, 3, async (item) => {
      if (item.group === 'A') {
        inGroupA += 1;
        maxInGroupA = Math.max(maxInGroupA, inGroupA);
      }
      if (item.id === 'a1') {
        aStarted.resolve();
        await releaseA.promise;
      }
      if (item.id === 'b1') {
        bStarted.resolve();
      }
      if (item.group === 'A') {
        inGroupA -= 1;
      }
      seen.push(item.id);
    }, (item) => item.group);

    await aStarted.promise;
    await bStarted.promise;
    expect(seen).not.toContain('a2');
    releaseA.resolve();
    await pending;
    expect(maxInGroupA).toBe(1);
    expect(seen.indexOf('a1')).toBeLessThan(seen.indexOf('a2'));
    expect(seen).toContain('b1');
  });

  it('runs records without a group key in parallel', async () => {
    const release = gate();
    const firstStarted = gate();
    const secondStarted = gate();
    const pending = runAtConcurrency(['u1', 'u2'], 2, async (id) => {
      if (id === 'u1') {
        firstStarted.resolve();
        await release.promise;
      }
      if (id === 'u2') {
        secondStarted.resolve();
      }
    }, () => undefined);

    await firstStarted.promise;
    await secondStarted.promise;
    release.resolve();
    await pending;
  });

  it('releases a group after the handler throws and still rejects', async () => {
    const seen: string[] = [];
    const pending = runAtConcurrency([
      { id: 'a1', group: 'A' },
      { id: 'a2', group: 'A' },
    ], 2, async (item) => {
      seen.push(item.id);
      if (item.id === 'a1') {
        throw new Error('boom');
      }
    }, (item) => item.group);

    await expect(pending).rejects.toThrow('boom');
    expect(seen).toEqual(['a1', 'a2']);
  });
});
