



const MyComponent = ({ expanded, onChange }: any) => (
  {/* TODO(backstage-codemod): finish accordion migration manually (expanded, onChange) */}
<Accordion expanded={expanded} onChange={onChange}>
    <AccordionSummary>Settings</AccordionSummary>
    <AccordionDetails>Content</AccordionDetails>
  </Accordion>
);
