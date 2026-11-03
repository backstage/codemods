import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = async () => {
    const result = await dialogApi.show({ content: <MyDialog /> });
    if (result == null) {
      console.log('dismissed');
    }
    if (result != null) {
      console.log('confirmed', result);
    }
  };

  return <button onClick={handleClick}>Open</button>;
}
