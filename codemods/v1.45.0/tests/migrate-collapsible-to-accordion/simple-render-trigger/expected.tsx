import { Accordion, AccordionTrigger, AccordionPanel } from '@backstage/ui';

export const Example = () => (
  <Accordion>
    {/* TODO(backstage-codemod): Review Collapsible.Trigger render migration */}
    <AccordionTrigger render={(props) => <Icon {...props} />} />
    <AccordionPanel>Content here</AccordionPanel>
  </Accordion>
);
