import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);
  console.log(dialogApi);
  return <div>No dialog calls here</div>;
}
