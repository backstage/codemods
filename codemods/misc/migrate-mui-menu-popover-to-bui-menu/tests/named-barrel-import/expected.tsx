import { Menu, MenuItem } from '@material-ui/core';

const MyComponent = () => (
  <>
  {/* TODO(backstage-codemod): finish menu host migration manually (no-trigger-element) */}
  <Menu open={isOpen}>
    <MenuItem onClick={doStuff}>Do stuff</MenuItem>
  </Menu>
</>
);
