import Tooltip from '@material-ui/core/Tooltip';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <Tooltip title="Save changes">
    <Button variant="primary">Save</Button>
  </Tooltip>
);
