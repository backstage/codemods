import { Accordion, AccordionSummary, AccordionDetails, Button } from '@material-ui/core';

const MyComponent = () => (
  <>
    <Accordion>
      <AccordionSummary>FAQ</AccordionSummary>
      <AccordionDetails>Answers here</AccordionDetails>
    </Accordion>
    <Button>Save</Button>
  </>
);
