import { createApp } from '@backstage/frontend-defaults';

const allowUnknownExtensionConfig = true;
const app = createApp({ features: [...plugins] });
