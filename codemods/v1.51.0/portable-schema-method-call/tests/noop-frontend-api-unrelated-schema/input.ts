import { createExtension } from '@backstage/frontend-plugin-api';

interface Config {
  schema: {
    type: string;
    properties: Record<string, unknown>;
  };
}

export default createExtension({
  name: 'example',
  attachTo: { id: 'app', input: 'routes' },
  output: [],
  factory: ({ config }: { config: Config }) => {
    const schemaType = config.schema.type;
    const props = config.schema.properties;
    return [schemaType, props];
  },
});
