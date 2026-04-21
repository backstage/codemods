import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = () => {
    dialogApi.showModal({ content: <ConfirmDialog /> });
  };

  return <button onClick={handleClick}>Open</button>;
}
