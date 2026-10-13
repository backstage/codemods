import { PodLogs } from '@backstage/plugin-kubernetes-react';

export function Example() {
  // TODO(backstage-codemod): Review effectful Kubernetes component children manually before removal.
  return (
    <>
      <PodLogs>
        <_Widget />
      </PodLogs>
      <PodLogs>
        <$Comp />
      </PodLogs>
      <PodLogs />
    </>
  );
}
