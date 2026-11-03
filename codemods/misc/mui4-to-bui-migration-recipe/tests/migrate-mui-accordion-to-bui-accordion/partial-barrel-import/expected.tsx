import { Button } from '@material-ui/core';
import { Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Accordion><AccordionTrigger title={"FAQ"} /><AccordionPanel>Answers here</AccordionPanel></Accordion>
    <Button>Save</Button>
  </>
);
