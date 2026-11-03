import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Menu open={open} onClose={onClose}>
    <MenuItem onClick={handleEdit}>Edit</MenuItem>
    <MenuItem onClick={handleDelete}>Delete</MenuItem>
  </Menu>
);
