import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';

const MyComponent = () => (
  <Accordion>
    <AccordionSummary>
      <span>Title</span>
      <span>Subtitle</span>
    </AccordionSummary>
    <AccordionDetails>Body</AccordionDetails>
  </Accordion>
);
