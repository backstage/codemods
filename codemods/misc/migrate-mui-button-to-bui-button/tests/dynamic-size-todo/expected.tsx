import Button from '@material-ui/core/Button';

const MyComponent = ({ size }: { size: 'small' | 'medium' | 'large' }) => (
  <>
  {/* TODO(backstage-codemod): verify Button intent manually (dynamic-size) */}
  <Button variant="contained" size={size} onClick={handleSave}>
    Save
  </Button>
</>
);
