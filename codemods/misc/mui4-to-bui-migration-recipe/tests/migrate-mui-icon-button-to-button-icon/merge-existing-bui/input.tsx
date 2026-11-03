import IconButton from '@material-ui/core/IconButton';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button variant="primary">Save</Button>
    <IconButton aria-label="close" onClick={handleClose}>
      <CloseIcon />
    </IconButton>
  </>
);
