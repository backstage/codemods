import { Fragment } from 'react';
import * as Kubernetes from '@backstage/plugin-kubernetes-react';

export function Example() {
  return (
    <Kubernetes.ContainerCard>
      <Fragment>
        <span>Status</span>
      </Fragment>
    </Kubernetes.ContainerCard>
  );
}
