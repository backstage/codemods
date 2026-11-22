import { prepareSpecializedApp as prepare, type PrepareSpecializedAppOptions as Options } from '@backstage/frontend-app-api';
const opts: Options = {};
const app = prepare(opts).finalize();
