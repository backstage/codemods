import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const handleClick = () => {
    // TODO(backstage-codemod): open() returns TResult (not TResult | undefined). Add your own dialog chrome and dismissal handling.
    dialogApi.open({ content: <MyDialog /> }).then(result => {
      // TODO(backstage-codemod): open() no longer returns undefined on dismissal. This check may be unreachable.
      if (result === undefined) {
        console.log('dismissed');
      }
    });
  };

  return <button onClick={handleClick}>Open</button>;
}
