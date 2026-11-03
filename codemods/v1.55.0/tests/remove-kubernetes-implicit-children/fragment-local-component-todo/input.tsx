import { PodLogs } from '@backstage/plugin-kubernetes-react';

function Fragment({ children }) {
  return <section>{children}</section>;
}

export function Example() {
  return (
    <PodLogs>
      <Fragment>
        <span>Keep this local component evaluation.</span>
      </Fragment>
    </PodLogs>
  );
}
