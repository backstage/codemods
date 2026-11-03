import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';

const MyComponent = () => (
  <Accordion>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      Section title
    </AccordionSummary>
    <AccordionDetails>Body content here</AccordionDetails>
  </Accordion>
);
