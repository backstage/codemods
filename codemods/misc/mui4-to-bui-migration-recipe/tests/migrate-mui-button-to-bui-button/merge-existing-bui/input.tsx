import Button from '@material-ui/core/Button';
import { Alert } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Alert status="info" icon />
    <Button variant="contained" onClick={handleSave}>Save</Button>
  </>
);
