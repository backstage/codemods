import type { DialogApi } from '@backstage/frontend-plugin-api';

function openDialog(api: DialogApi) {
  // TODO(backstage-codemod): open() returns TResult (not TResult | undefined). Add your own dialog chrome and dismissal handling.
  api.open({ content: <MyDialog /> });
}

function openModalDialog(api: DialogApi) {
  // TODO(backstage-codemod): open() renders without built-in dialog chrome. Wrap your content in a dialog component.
  api.open({ content: <ConfirmDialog /> });
}
