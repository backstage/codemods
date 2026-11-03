import { AnyExtensionDataRef, ExtensionDataRef as EDR } from '@backstage/frontend-plugin-api';

function process(ref: AnyExtensionDataRef) {
  return ref;
}

function other(ref: EDR) {
  return ref;
}
