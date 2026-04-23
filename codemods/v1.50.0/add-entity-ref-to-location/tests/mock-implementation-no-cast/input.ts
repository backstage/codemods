import type { Location } from '@backstage/catalog-client';

const mockGetLocation = jest.fn<() => Location>().mockImplementation(() => ({
  id: 'mock-1',
  type: 'url',
  target: 'https://example.com/mock.yaml',
}));

const mockReturnLocation = jest.fn<() => Location>().mockReturnValue({
  id: 'mock-2',
  type: 'url',
  target: 'https://example.com/other.yaml',
});
