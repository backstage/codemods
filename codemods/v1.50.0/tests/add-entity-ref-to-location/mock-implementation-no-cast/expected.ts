import type { Location } from '@backstage/catalog-client';

const mockGetLocation = jest.fn<() => Location>().mockImplementation(() => ({
  id: 'mock-1',
  type: 'url',
  target: 'https://example.com/mock.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
}));

const mockReturnLocation = jest.fn<() => Location>().mockReturnValue({
  id: 'mock-2',
  type: 'url',
  target: 'https://example.com/other.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
});
