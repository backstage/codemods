import { PodLogs } from '@backstage/plugin-kubernetes-react';

const buildMessage = () => 'logs';

export function Example() {
  return <PodLogs>{buildMessage()}</PodLogs>;
}
