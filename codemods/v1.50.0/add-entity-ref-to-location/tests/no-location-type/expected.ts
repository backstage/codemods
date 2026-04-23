// No Location type imported or used - should be a no-op
const loc = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
};

interface MyLocation {
  id: string;
  name: string;
}

const myLoc: MyLocation = {
  id: '1',
  name: 'test',
};
