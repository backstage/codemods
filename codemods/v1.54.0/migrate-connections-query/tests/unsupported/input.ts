import type { ConnectionsService } from '@backstage/connections';

function lookup(connections: ConnectionsService, type: string, url: string, extra: object) {
  connections.find({ type: 'custom', url });
  connections.find({ type: 'aws', url });
  connections.find({ type, url });
  connections.find({ type: 'github', url, ...extra });
  connections.find({ type: 'github', ['other']: 1, url });
  connections.find({ type: 'github', ['url']: url });
  connections.find({ type: 'github', url, ['query']: { url } });
  connections.find({ type: 'github', url, query() { return { url }; } });
  connections.find({ type: 'github', url, 'query'() { return { url }; } });
  connections.find({ type: 'github', url, "query"() { return { url }; } });
  connections.find({ type: 'github', url, url: 'duplicate' });
  connections.find({ type: 'github', url, query: { url } });
  connections.find({ type: 'github', url, query });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'custom', url });
}
