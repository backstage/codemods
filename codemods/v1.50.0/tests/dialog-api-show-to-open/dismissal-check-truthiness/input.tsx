import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = async () => {
    const result = await dialogApi.show({ content: <MyDialog /> });
    if (result) {
      console.log('confirmed', result);
    }
    if (!result) {
      console.log('dismissed');
    }
  };

  return <button onClick={handleClick}>Open</button>;
}
