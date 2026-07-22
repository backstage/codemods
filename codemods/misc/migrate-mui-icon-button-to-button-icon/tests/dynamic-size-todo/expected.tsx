import IconButton from '@material-ui/core/IconButton';

const MyComponent = ({ size }: { size: 'small' | 'medium' | 'large' }) => (
  <>
  {/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}
  <IconButton aria-label="menu" size={size} onClick={handleMenu}>
    <MenuIcon />
  </IconButton>
</>
);
