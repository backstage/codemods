import type { StreamEntitiesRequest } from '@backstage/catalog-client';

const request: StreamEntitiesRequest = { limit: 100 };

await catalogClient.streamEntities(request);
