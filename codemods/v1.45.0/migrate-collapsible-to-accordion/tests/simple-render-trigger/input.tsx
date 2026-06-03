import { Collapsible } from '@backstage/ui';

export const Example = () => (
  <Collapsible.Root>
    <Collapsible.Trigger render={(props) => <Icon {...props} />} />
    <Collapsible.Panel>Content here</Collapsible.Panel>
  </Collapsible.Root>
);
