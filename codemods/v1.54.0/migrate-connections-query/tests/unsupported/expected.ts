import type { ConnectionsService } from '@backstage/connections';

function lookup(connections: ConnectionsService, type: string, url: string, extra: object) {
  const key = 'query';
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'custom', url });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'aws', url });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type, url });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'github', url, ...extra });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'github', ['other']: 1, url });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'github', ['url']: url });
  connections.find({ type: 'github', url, ['query']: { url } });
  connections.find({ type: 'github', url, query() { return { url }; } });
  connections.find({ type: 'github', url, 'query'() { return { url }; } });
  connections.find({ type: 'github', url, "query"() { return { url }; } });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'github', url, [key]() { return { url }; } });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'github', url, ['q u e r y']: { url } });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'github', url, url: 'duplicate' });
  connections.find({ type: 'github', url, query: { url } });
  connections.find({ type: 'github', url, query });
  /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ connections.find({ type: 'custom', url });
}
