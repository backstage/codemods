import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
  {/* TODO(backstage-codemod): finish menu host migration manually (no-trigger-element) */}
  <Menu open={open} onClose={onClose}>
    <MenuItem onClick={handleEdit}>Edit</MenuItem>
    <MenuItem onClick={handleDelete}>Delete</MenuItem>
  </Menu>
</>
);
