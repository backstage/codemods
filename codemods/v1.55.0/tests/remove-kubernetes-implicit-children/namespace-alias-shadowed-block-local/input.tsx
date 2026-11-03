import * as KubernetesComponents from '@backstage/plugin-kubernetes-react';

function renderShadow() {
  const KubernetesComponents = {
    ContainerCard: ({ children }) => <section>{children}</section>,
  };

  return (
    <KubernetesComponents.ContainerCard>
      Keep this block-scoped local namespace usage.
    </KubernetesComponents.ContainerCard>
  );
}

export function Example() {
  return (
    <>
      {renderShadow()}
      <KubernetesComponents.ContainerCard>Remove this imported namespace child.</KubernetesComponents.ContainerCard>
    </>
  );
}
