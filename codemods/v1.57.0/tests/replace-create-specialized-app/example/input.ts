import { createSpecializedApp, CreateSpecializedAppOptions } from '@backstage/frontend-app-api';
const options: CreateSpecializedAppOptions = { features, config };
const app = createSpecializedApp(options);
type AppFactory = typeof createSpecializedApp;
const factory = createSpecializedApp;
