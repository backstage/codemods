import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import { Button } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    <Button>Unrelated</Button>
    <span>spacer</span>
    <Button>Open menu</Button>
    <Menu open={open} onClose={onClose}>
      <MenuItem onClick={handleEdit}>Edit</MenuItem>
    </Menu>
  </>
);
