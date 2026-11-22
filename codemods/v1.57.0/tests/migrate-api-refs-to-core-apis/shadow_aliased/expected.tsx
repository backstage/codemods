// TODO(backstage-codemod): migrate deprecated API refs to coreApis manually because the coreApis binding is shadowed.
import { coreApis as ca, configApiRef } from '@backstage/frontend-plugin-api';
function f({ ca }: Props) {
  return configApiRef;
}
