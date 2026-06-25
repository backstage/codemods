import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Accordion>
      <AccordionSummary>Info</AccordionSummary>
      <AccordionDetails>Details</AccordionDetails>
    </Accordion>
  </>
);
