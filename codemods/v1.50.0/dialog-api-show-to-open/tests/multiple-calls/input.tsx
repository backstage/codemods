import { useApi, dialogApiRef } from '@backstage/frontend-plugin-api';

function MyComponent() {
  const dialogApi = useApi(dialogApiRef);

  const openFirst = async () => {
    const result = await dialogApi.show({ content: <FirstDialog /> });
    console.log(result);
  };

  const openSecond = () => {
    dialogApi.showModal({ content: <SecondDialog /> });
  };

  return (
    <div>
      <button onClick={openFirst}>First</button>
      <button onClick={openSecond}>Second</button>
    </div>
  );
}
