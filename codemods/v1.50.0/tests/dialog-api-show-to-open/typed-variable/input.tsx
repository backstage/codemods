import type { DialogApi } from '@backstage/frontend-plugin-api';

function openDialog(api: DialogApi) {
  api.show({ content: <MyDialog /> });
}

function openModalDialog(api: DialogApi) {
  api.showModal({ content: <ConfirmDialog /> });
}
