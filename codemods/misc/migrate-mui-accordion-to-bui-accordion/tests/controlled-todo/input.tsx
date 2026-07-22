import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';

const MyComponent = ({ expanded, onChange }: any) => (
  <Accordion expanded={expanded} onChange={onChange}>
    <AccordionSummary>Settings</AccordionSummary>
    <AccordionDetails>Content</AccordionDetails>
  </Accordion>
);
