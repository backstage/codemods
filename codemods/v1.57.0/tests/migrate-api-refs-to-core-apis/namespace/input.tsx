import * as fpa from '@backstage/frontend-plugin-api';
import * as alpha from '@backstage/frontend-plugin-api/alpha';
const x = fpa.configApiRef;
const y = alpha.pluginWrapperApiRef;
const skipped = fpa.alertApiRef;
function other(fpa: any) { return fpa.configApiRef; }
