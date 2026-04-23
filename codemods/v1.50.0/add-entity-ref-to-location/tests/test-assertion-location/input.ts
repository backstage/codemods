import type { Location } from '@backstage/catalog-client';

function getLocation(): Location {
  return {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/catalog-info.yaml',
  };
}

describe('getLocation', () => {
  it('should return a Location', () => {
    const result: Location = getLocation();
    expect(result).toEqual({
      id: 'abc123',
      type: 'url',
      target: 'https://example.com/catalog-info.yaml',
    });
  });

  it('should match partial Location', () => {
    const result: Location = getLocation();
    expect(result).toMatchObject({
      id: 'abc123',
      type: 'url',
    });
  });
});
