import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = async () => {
    const result = await dialogApi.show({ content: <MyDialog /> });
    const value = result ?? 'default';
    console.log(value);
  };

  return <button onClick={handleClick}>Open</button>;
}
