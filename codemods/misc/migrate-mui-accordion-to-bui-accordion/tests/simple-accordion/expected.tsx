

import AccordionDetails from '@material-ui/core/AccordionDetails';
import { Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';

const MyComponent = () => (
  <Accordion><AccordionTrigger title="Section title" /><AccordionPanel>Body content here</AccordionPanel></Accordion>
);
