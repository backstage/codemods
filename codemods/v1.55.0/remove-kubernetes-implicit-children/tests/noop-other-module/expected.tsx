import { ContainerCard, FixDialog, PodLogs } from './k8s';

export function Example() {
  return (
    <>
      <FixDialog>Keep</FixDialog>
      <ContainerCard children="Keep" />
      <PodLogs>Keep</PodLogs>
    </>
  );
}
