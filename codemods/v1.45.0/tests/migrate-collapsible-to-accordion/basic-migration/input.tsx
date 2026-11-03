import { Collapsible } from '@backstage/ui';

export const Example = () => (
  <Collapsible.Root>
    <Collapsible.Trigger render={(props) => <button {...props}>Toggle</button>} />
    <Collapsible.Panel>Content here</Collapsible.Panel>
  </Collapsible.Root>
);
