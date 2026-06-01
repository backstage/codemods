import { createExtension } from '@backstage/frontend-plugin-api';

export default createExtension({
  name: 'example',
  attachTo: { id: 'app', input: 'routes' },
  output: [],
  factory: ({ config }) => {
    const maybeType = config.schema?.type;
    return [];
  },
});
