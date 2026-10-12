import type { ConnectionsService as Service } from '@backstage/connections';
import { connectionsServiceRef as ref } from '@backstage/connections-node';
import type { ConnectionsService as OtherService } from 'other';

function find(connections: Service, url: string, query: object) {
  const data = { find: (opts: object) => opts };
  data.find({ type: 'github', url });
  connections.find({ type: 'github', query: { url } });
  connections.find({ type: 'github', query, url });
  connections.find({ type: 'github', url }, {});
  connections.find(options);
  const nested = (connections: { find: Function }) => connections.find({ type: 'github', url });
  return nested(data);
}
function other(connections: OtherService, url: string) {
  connections.find({ type: 'github', url });
}
function shadowRef(ref: object, url: string) {
  const unrelated = {
    deps: { conn: ref },
    factory({ conn }: { conn: { find: Function } }) {
      conn.find({ type: 'github', url });
    },
  };
  return unrelated;
}
const factory = {
  deps: { conn: ref },
  factory({ conn }: { conn: Service }) {
    const connections = { find: (opts: object) => opts };
    connections.find({ type: 'github', url: 'not-backstage' });
  },
};

const unrelatedArrow = {
  deps: { conn: ref },
  factory: ({ other }: { other: { find: Function } }) => other.find({ type: 'github', url: 'not-backstage' }),
};
const shadowedArrow = {
  deps: { conn: ref },
  factory: ({ conn }) => {
    const nested = (conn: { find: Function }) => conn.find({ type: 'github', url: 'not-backstage' });
    return nested(conn);
  },
};
class OtherLookup {
  private readonly connections: OtherService;
  find(url: string) {
    return this.connections.find({ type: 'github', url });
  }
}
class SameName {
  private readonly connections: { find: Function };
  find(url: string) {
    return this.connections.find({ type: 'github', url });
  }
}
