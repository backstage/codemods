import { createApp } from '@backstage/frontend-defaults';

const app = createApp({
  // Keep this comment about features
  features: [...plugins],
  allowUnknownExtensionConfig: true,
});
