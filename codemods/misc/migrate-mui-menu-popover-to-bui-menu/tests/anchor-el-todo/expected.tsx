


const MyComponent = ({ anchorEl, open, onClose }: any) => (
  {/* TODO(backstage-codemod): finish menu host migration manually (anchorEl) */}
<Menu anchorEl={anchorEl} open={open} onClose={onClose}>
    <MenuItem onClick={handleAction}>Action</MenuItem>
  </Menu>
);
