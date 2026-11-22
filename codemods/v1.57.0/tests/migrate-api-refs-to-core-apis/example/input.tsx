import {
  ApiBlueprint,
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';

const api = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: myApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new MyClient({ discoveryApi, fetchApi }),
    }),
});

function MyComponent() {
  const config = useApi(configApiRef);
  return <div>{config.getString('title')}</div>;
}
