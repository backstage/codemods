import type { ConnectionsService as Service } from '@backstage/connections';
import { connectionsServiceRef as ref } from '@backstage/connections-node';
import { connectionsServiceRef as oldRef } from '@backstage/connections';

async function lookup(connections: Service, url: string) {
  await connections.find({ type: 'github', query: { url }, authMethods: ['app', 'token'] });
  await connections.find({ query: { url: new URL(url).toString() }, type: 'aws-s3', authMethods: ['none'] });
  const annotated: Service = connections;
  await annotated.find({ type: 'azure', query: { 'url': url }, authMethods: ['token'] });
}

const factory = {
  deps: { connections: ref },
  async factory({ connections }) {
    return connections.find({ type: 'gitlab', query: { url }, authMethods: ['token'] });
  },
};
const legacy = {
  deps: { connections: oldRef },
  factory({ connections }) {
    return connections.find({ type: 'gerrit', query: { url: getUrl() } });
  },
};
