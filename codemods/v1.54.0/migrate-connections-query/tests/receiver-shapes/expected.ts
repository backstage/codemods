import type { ConnectionsService as Service } from '@backstage/connections';
import { connectionsServiceRef as ref } from '@backstage/connections-node';

const arrow = {
  deps: { connections: ref },
  factory: ({ connections }) => connections.find({ type: 'github', query: { url: 'https://github.com/backstage/backstage' } }),
};
const asyncArrow = {
  deps: { conn: ref },
  factory: async ({ conn }) => conn.find({ type: 'gitlab', query: { url: getUrl() } }),
};
const renamed = {
  deps: { connections: ref },
  factory: function({ connections: conn }) {
    conn.find({ type: 'github', query: { url: getUrl() } });
  },
};

class Lookup {
  private readonly connections: Service;
  constructor(connections: Service) {
    this.connections = connections;
  }
  static notInstance(url: string) {
    return this.connections.find({ type: 'github', url });
  }
  find(url: string) {
    return this.connections.find({ type: 'github', query: { url } });
  }
}
