


import { Accordion, AccordionPanel, AccordionTrigger, Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Accordion><AccordionTrigger title={"Info"} /><AccordionPanel>Details</AccordionPanel></Accordion>
  </>
);
