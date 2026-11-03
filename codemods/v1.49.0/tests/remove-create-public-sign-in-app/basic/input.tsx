import { createPublicSignInApp } from '@backstage/frontend-defaults';

const app = createPublicSignInApp({ features: [...plugins] });
