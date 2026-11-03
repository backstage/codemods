import { Collapsible } from '@backstage/ui';

export const Example = () => (
  <Collapsible.Root>
    <Collapsible.Trigger render={(props) => {
      const cls = isOpen ? 'open' : 'closed';
      return <button {...props} className={cls}>Toggle</button>;
    }} />
    <Collapsible.Panel>Content</Collapsible.Panel>
  </Collapsible.Root>
);
