import { prepareSpecializedApp, PrepareSpecializedAppOptions } from '@backstage/frontend-app-api';
const options: PrepareSpecializedAppOptions = { features, config };
const app = prepareSpecializedApp(options).finalize();
type AppFactory = typeof prepareSpecializedApp;
const factory = prepareSpecializedApp;
