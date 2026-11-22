// TODO(backstage-codemod): migrate deprecated API refs to coreApis manually because the coreApis binding is shadowed.
import { configApiRef } from '@backstage/frontend-plugin-api';
function f(coreApis: unknown) { return coreApis; }
const ref = configApiRef;
