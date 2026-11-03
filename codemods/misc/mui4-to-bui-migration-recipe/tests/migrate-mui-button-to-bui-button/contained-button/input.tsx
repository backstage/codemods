import Button from '@material-ui/core/Button';

const MyComponent = () => (
  <Button variant="contained" disabled={loading} onClick={handleSave}>
    Save
  </Button>
);
