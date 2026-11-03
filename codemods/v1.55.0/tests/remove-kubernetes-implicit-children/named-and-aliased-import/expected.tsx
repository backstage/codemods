import { ContainerCard as CardAlias, FixDialog, PodLogs } from '@backstage/plugin-kubernetes-react';

export function Example() {
  return (
    <>
      <FixDialog />
      <CardAlias />
      <PodLogs />
    </>
  );
}
