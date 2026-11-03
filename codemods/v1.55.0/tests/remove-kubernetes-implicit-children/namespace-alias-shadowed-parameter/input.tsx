import * as KubernetesComponents from '@backstage/plugin-kubernetes-react';

function renderShadow(KubernetesComponents) {
  return <KubernetesComponents.ContainerCard>Keep this local namespace usage.</KubernetesComponents.ContainerCard>;
}

export function Example() {
  return (
    <>
      {renderShadow({ ContainerCard: () => null })}
      <KubernetesComponents.ContainerCard>Remove this imported namespace child.</KubernetesComponents.ContainerCard>
    </>
  );
}
