import { Accordion, AccordionTrigger, AccordionPanel } from '@backstage/ui';

const MyComponent = () => (
  <Accordion>
    <AccordionTrigger title="Already migrated" />
    <AccordionPanel>Content</AccordionPanel>
  </Accordion>
);
