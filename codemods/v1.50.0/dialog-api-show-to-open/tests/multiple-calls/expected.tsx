import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const openFirst = async () => {
    // TODO(backstage-codemod): open() returns TResult (not TResult | undefined). Add your own dialog chrome and dismissal handling.
    const result = await dialogApi.open({ content: <FirstDialog /> });
    console.log(result);
  };

  const openSecond = () => {
    // TODO(backstage-codemod): open() renders without built-in dialog chrome. Wrap your content in a dialog component.
    dialogApi.open({ content: <SecondDialog /> });
  };

  return (
    <div>
      <button onClick={openFirst}>First</button>
      <button onClick={openSecond}>Second</button>
    </div>
  );
}
