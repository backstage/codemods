import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

const schema = z.object({
  title: z.string(),
});

createExtension({
  name: 'my-extension',
  attachTo: { id: 'page', input: 'main' },
  output: [coreExtensionData.reactElement],
  *factory() {
    yield coreExtensionData.reactElement(<div>Hello</div>);
  },
});
