import { alertApiRef, githubAuthApiRef, coreApis } from '@backstage/frontend-plugin-api';
import { configApiRef } from '@backstage/core-plugin-api';
import { discoveryApiRef } from 'another-package';
const x = [alertApiRef, githubAuthApiRef, configApiRef, discoveryApiRef, coreApis.config];
