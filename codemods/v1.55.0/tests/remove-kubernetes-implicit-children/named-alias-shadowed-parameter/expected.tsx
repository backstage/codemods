import { PodLogs as ImportedPodLogs } from '@backstage/plugin-kubernetes-react';

function renderShadow(ImportedPodLogs) {
  return <ImportedPodLogs>Keep this local component usage.</ImportedPodLogs>;
}

export function Example() {
  return (
    <>
      {renderShadow(() => null)}
      <ImportedPodLogs />
    </>
  );
}
