import Button from '@material-ui/core/Button';

const MyComponent = () => (
  <>
  {/* TODO(backstage-codemod): verify Button intent manually (startIcon) */}
  <Button variant="contained" startIcon={<SaveIcon />}>Save</Button>
</>
);
