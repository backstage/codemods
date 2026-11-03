import Popover from '@material-ui/core/Popover';
import MenuList from '@material-ui/core/MenuList';
import MenuItem from '@material-ui/core/MenuItem';
import { Button } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    <Button>Open menu</Button>
    <Popover open={open} onClose={onClose}>
      <MenuList>
        <MenuItem onClick={handleAction}>Action</MenuItem>
      </MenuList>
    </Popover>
  </>
);
