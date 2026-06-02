import { Collapsible as Collapse } from '@backstage/ui';

export const Example = () => (
  <Collapse.Root>
    <Collapse.Trigger>Toggle</Collapse.Trigger>
    <Collapse.Panel>Content</Collapse.Panel>
  </Collapse.Root>
);
