import Button from '@material-ui/core/Button';

const MyComponent = ({ size }: { size: 'small' | 'medium' | 'large' }) => (
  <Button variant="contained" size={size} onClick={handleSave}>
    Save
  </Button>
);
