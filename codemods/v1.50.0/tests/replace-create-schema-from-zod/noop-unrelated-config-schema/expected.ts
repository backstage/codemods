import { z } from 'zod/v4';

// This object has config.schema but is NOT inside createExtension, createExtensionBlueprint, .override(), or .make()
const myConfig = {
  config: {
    schema: {
      title: z => z.string().default('Hello'),
      count: z => z.number().optional(),
    },
  },
};

function buildConfig() {
  return {
    config: {
      schema: createSchemaFromZod(z =>
        z.object({
          path: z.string(),
        }),
      ),
    },
  };
}
