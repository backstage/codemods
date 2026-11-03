import { ContainerCard as CardAlias, FixDialog, PodLogs } from '@backstage/plugin-kubernetes-react';

export function Example() {
  return (
    <>
      <FixDialog>Done</FixDialog>
      <CardAlias children="Summary" />
      <PodLogs>{<span>Logs</span>}</PodLogs>
    </>
  );
}
