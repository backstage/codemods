import { createApp } from '@backstage/frontend-defaults';

const app = createApp({ features: [...plugins], allowUnknownExtensionConfig: true });
