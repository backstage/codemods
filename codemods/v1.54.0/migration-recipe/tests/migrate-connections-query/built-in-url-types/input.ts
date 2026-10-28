import type { ConnectionsService } from '@backstage/connections';

function lookup(connections: ConnectionsService, url: string) {
  connections.find({ type: 'aws-codecommit', url });
  connections.find({ type: 'aws-s3', url });
  connections.find({ type: 'azure', url });
  connections.find({ type: 'azure-blob-storage', url });
  connections.find({ type: 'bitbucket-cloud', url });
  connections.find({ type: 'bitbucket-server', url });
  connections.find({ type: 'gerrit', url });
  connections.find({ type: 'gitea', url });
  connections.find({ type: 'github', url });
  connections.find({ type: 'gitlab', url });
  connections.find({ type: 'google-gcs', url });
  connections.find({ type: 'harness', url });
}
