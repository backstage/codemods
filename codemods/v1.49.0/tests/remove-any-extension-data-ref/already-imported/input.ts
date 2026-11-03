import { AnyExtensionDataRef, ExtensionDataRef } from '@backstage/frontend-plugin-api';

function process(ref: AnyExtensionDataRef) {
  return ref;
}

function other(ref: ExtensionDataRef) {
  return ref;
}
