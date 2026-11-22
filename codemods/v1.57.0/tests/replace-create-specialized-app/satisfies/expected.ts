import { prepareSpecializedApp, type PrepareSpecializedAppOptions } from '@backstage/frontend-app-api';
const options = { features: [] } satisfies PrepareSpecializedAppOptions;
export const app = prepareSpecializedApp(options).finalize();
const defaultApp = prepareSpecializedApp().finalize();
const safeApp = prepareSpecializedApp({ advanced: { sessionState } } as PrepareSpecializedAppOptions).finalize();
