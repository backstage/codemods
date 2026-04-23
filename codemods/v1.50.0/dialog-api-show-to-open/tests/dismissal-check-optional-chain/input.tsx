import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = async () => {
    const result = await dialogApi.show({ content: <MyDialog /> });
    const name = result?.name;
    console.log(name);
  };

  return <button onClick={handleClick}>Open</button>;
}
