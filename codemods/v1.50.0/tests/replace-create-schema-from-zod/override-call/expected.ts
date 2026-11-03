import { z } from 'zod/v4';

const overridden = MyBlueprint.make({
  configSchema: {
    title: z.string().default('Override'),
  },
});
