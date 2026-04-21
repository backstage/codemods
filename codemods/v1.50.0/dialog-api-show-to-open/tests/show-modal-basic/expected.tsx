import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = () => {
    // TODO(backstage-codemod): open() renders without built-in dialog chrome. Wrap your content in a dialog component.
    dialogApi.open({ content: <ConfirmDialog /> });
  };

  return <button onClick={handleClick}>Open</button>;
}
