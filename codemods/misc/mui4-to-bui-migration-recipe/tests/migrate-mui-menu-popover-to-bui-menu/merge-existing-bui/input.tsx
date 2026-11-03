import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Trigger</Button>
    <Menu open={open}>
      <MenuItem onClick={handleAction}>Action</MenuItem>
    </Menu>
  </>
);
