import { Collapsible } from '@backstage/ui';

export const Example = () => (
  <Collapsible.Root>
    <Collapsible.Trigger>Click me</Collapsible.Trigger>
    <Collapsible.Panel>Content</Collapsible.Panel>
  </Collapsible.Root>
);
