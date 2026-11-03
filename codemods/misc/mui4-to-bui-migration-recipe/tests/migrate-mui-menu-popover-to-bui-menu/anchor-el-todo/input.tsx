import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';

const MyComponent = ({ anchorEl, open, onClose }: any) => (
  <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
    <MenuItem onClick={handleAction}>Action</MenuItem>
  </Menu>
);
