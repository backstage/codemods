import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = async () => {
    const result = await dialogApi.show({ content: <MyDialog /> });
    const message = result ? 'confirmed' : 'dismissed';
    console.log(message);
  };

  return <button onClick={handleClick}>Open</button>;
}
