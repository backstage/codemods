import {
  ApiBlueprint,
  useApi,
  coreApis,
} from '@backstage/frontend-plugin-api';

const api = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: myApiRef,
      deps: {
        discoveryApi: coreApis.discovery,
        fetchApi: coreApis.fetch,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new MyClient({ discoveryApi, fetchApi }),
    }),
});

function MyComponent() {
  const config = useApi(coreApis.config);
  return <div>{config.getString('title')}</div>;
}
