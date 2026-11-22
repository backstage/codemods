import { createSpecializedApp, type CreateSpecializedAppOptions } from '@backstage/frontend-app-api';
const options = { features: [] } satisfies CreateSpecializedAppOptions;
export const app = createSpecializedApp(options);
const defaultApp = createSpecializedApp();
const safeApp = createSpecializedApp({ advanced: { sessionState } } as CreateSpecializedAppOptions);
