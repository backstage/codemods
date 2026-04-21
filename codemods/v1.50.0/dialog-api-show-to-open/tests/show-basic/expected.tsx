import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = async () => {
    // TODO(backstage-codemod): open() returns TResult (not TResult | undefined). Add your own dialog chrome and dismissal handling.
    const result = await dialogApi.open({ content: <MyDialog /> });
    console.log(result);
  };

  return <button onClick={handleClick}>Open</button>;
}
