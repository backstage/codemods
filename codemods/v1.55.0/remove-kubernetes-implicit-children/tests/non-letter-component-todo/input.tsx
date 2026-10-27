import { PodLogs } from '@backstage/plugin-kubernetes-react';

export function Example() {
  return (
    <>
      <PodLogs>
        <_Widget />
      </PodLogs>
      <PodLogs>
        <$Comp />
      </PodLogs>
      <PodLogs>
        <span />
      </PodLogs>
    </>
  );
}
