import { Accordion, AccordionTrigger, AccordionPanel } from '@backstage/ui';

export const Example = () => (
  <Accordion>
    <AccordionTrigger>Toggle</AccordionTrigger>
    <AccordionPanel>Content</AccordionPanel>
  </Accordion>
);
