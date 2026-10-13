declare function createServiceRef<T>(options: { id: string; scope: string }): unknown;

export const connectionsServiceRef = createServiceRef<
  import('@backstage/connections').ConnectionsService
>({
  id: 'alpha.core.connections',
  scope: 'plugin',
});

void connectionsServiceRef;
