import type { StreamEntitiesRequest } from '@backstage/catalog-client';

const request: StreamEntitiesRequest = { totalItems: true, limit: 100 };

await catalogClient.streamEntities(request);
