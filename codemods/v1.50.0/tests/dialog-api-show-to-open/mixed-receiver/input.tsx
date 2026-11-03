import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

interface ModalService {
  show(options: { content: string }): void;
  showModal(options: { content: string }): void;
}

function MyComponent({ modalService }: { modalService: ModalService }) {
  const dialogApi = useApi(dialogApiRef);

  const handleDialog = () => {
    dialogApi.show({ content: <MyDialog /> });
  };

  const handleModal = () => {
    // This should NOT be renamed — modalService is not a DialogApi
    modalService.show({ content: 'hello' });
    modalService.showModal({ content: 'world' });
  };

  return <div />;
}
