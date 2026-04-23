import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';

createExtension({
  name: 'my-extension',
  attachTo: { id: 'page', input: 'main' },
  output: [coreExtensionData.reactElement],
  *factory() {
    yield coreExtensionData.reactElement(<div>Hello</div>);
  },
});
