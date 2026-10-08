import { itemFailure } from '../../src/core/item-failure';

describe('itemFailure', () => {
  it.each(['id', 'custom-id', ''])('returns batchItemFailures entry for %s', (itemIdentifier) => {
    expect(itemFailure(itemIdentifier)).toEqual({ itemIdentifier });
  });
});
