import { Accordion, AccordionTrigger, AccordionPanel } from '@backstage/ui';

export const Example = () => (
  <Accordion>
    {/* TODO(backstage-codemod): Review Collapsible.Trigger render migration */}
    <AccordionTrigger render={(props) => {
      const cls = isOpen ? 'open' : 'closed';
      return <button {...props} className={cls}>Toggle</button>;
    }} />
    <AccordionPanel>Content</AccordionPanel>
  </Accordion>
);
