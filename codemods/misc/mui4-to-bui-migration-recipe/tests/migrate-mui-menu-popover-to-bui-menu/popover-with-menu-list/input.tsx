import Popover from '@material-ui/core/Popover';
import MenuList from '@material-ui/core/MenuList';
import MenuItem from '@material-ui/core/MenuItem';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Popover open={open} onClose={onClose}>
    <MenuList>
      <MenuItem onClick={handleAction}>Action</MenuItem>
    </MenuList>
  </Popover>
);
