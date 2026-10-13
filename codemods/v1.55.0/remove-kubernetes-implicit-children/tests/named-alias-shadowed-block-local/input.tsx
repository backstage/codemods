import { PodLogs as ImportedPodLogs } from '@backstage/plugin-kubernetes-react';

function renderShadow() {
  const ImportedPodLogs = ({ children }) => <section>{children}</section>;
  return <ImportedPodLogs>Keep this block-scoped local component usage.</ImportedPodLogs>;
}

export function Example() {
  return (
    <>
      {renderShadow()}
      <ImportedPodLogs>Remove this imported component child.</ImportedPodLogs>
    </>
  );
}
