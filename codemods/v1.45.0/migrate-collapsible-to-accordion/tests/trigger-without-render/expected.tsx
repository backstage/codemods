import { Accordion, AccordionTrigger, AccordionPanel } from '@backstage/ui';

export const Example = () => (
  <Accordion>
    <AccordionTrigger>Click me</AccordionTrigger>
    <AccordionPanel>Content</AccordionPanel>
  </Accordion>
);
