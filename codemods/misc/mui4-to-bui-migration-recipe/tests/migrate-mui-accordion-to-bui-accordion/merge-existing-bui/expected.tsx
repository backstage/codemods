import { Button, Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Accordion><AccordionTrigger title={"Info"} /><AccordionPanel>Details</AccordionPanel></Accordion>
  </>
);
