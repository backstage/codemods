import { Menu, MenuItem, Typography } from '@material-ui/core';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    <button onClick={() => {}}>Open</button>
    <Menu open={open} onClose={onClose}>
      <MenuItem onClick={handleEdit}>Edit</MenuItem>
    </Menu>
    <Typography>Keep me</Typography>
  </>
);
