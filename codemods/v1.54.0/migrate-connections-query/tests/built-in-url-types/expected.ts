import type { ConnectionsService } from '@backstage/connections';

function lookup(connections: ConnectionsService, url: string) {
  connections.find({ type: 'aws-codecommit', query: { url } });
  connections.find({ type: 'aws-s3', query: { url } });
  connections.find({ type: 'azure', query: { url } });
  connections.find({ type: 'azure-blob-storage', query: { url } });
  connections.find({ type: 'bitbucket-cloud', query: { url } });
  connections.find({ type: 'bitbucket-server', query: { url } });
  connections.find({ type: 'gerrit', query: { url } });
  connections.find({ type: 'gitea', query: { url } });
  connections.find({ type: 'github', query: { url } });
  connections.find({ type: 'gitlab', query: { url } });
  connections.find({ type: 'google-gcs', query: { url } });
  connections.find({ type: 'harness', query: { url } });
}
