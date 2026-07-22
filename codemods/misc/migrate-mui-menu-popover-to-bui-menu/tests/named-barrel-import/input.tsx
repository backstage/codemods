import { Menu, MenuItem } from '@material-ui/core';

const MyComponent = () => (
  <Menu open={isOpen}>
    <MenuItem onClick={doStuff}>Do stuff</MenuItem>
  </Menu>
);
