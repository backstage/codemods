import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = () => {
    dialogApi.show({ content: <MyDialog /> }).then(result => {
      console.log(result);
    });
  };

  return <button onClick={handleClick}>Open</button>;
}
