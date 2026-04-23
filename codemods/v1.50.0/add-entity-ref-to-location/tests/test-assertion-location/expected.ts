import type { Location } from '@backstage/catalog-client';

function getLocation(): Location {
  return {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/catalog-info.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  };
}

describe('getLocation', () => {
  it('should return a Location', () => {
    const result: Location = getLocation();
    expect(result).toEqual({
      id: 'abc123',
      type: 'url',
      target: 'https://example.com/catalog-info.yaml',
      entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
    });
  });

  it('should match partial Location', () => {
    const result: Location = getLocation();
    expect(result).toMatchObject({
      id: 'abc123',
      type: 'url',
      entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
    });
  });
});
