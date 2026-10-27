import { PodLogs } from '@backstage/plugin-kubernetes-react';

export function Example() {
  return (
    <PodLogs>
      <>
        <span>Logs</span>
      </>
    </PodLogs>
  );
}
