import { createPublicSignInApp, createApp } from '@backstage/frontend-defaults';

const publicApp = createPublicSignInApp({ features: [...plugins] });
const mainApp = createApp({ features: [...otherPlugins] });
