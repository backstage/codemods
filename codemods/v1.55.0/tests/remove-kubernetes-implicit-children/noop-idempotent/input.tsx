import { PodLogs } from '@backstage/plugin-kubernetes-react';

const buildMessage = () => 'logs';

export function Example() {
  // TODO(backstage-codemod): Review effectful Kubernetes component children manually before removal.
  return <PodLogs>{buildMessage()}</PodLogs>;
}
