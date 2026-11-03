import IconButton from '@material-ui/core/IconButton';

const MyComponent = () => (
  <>
  {/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}
  <IconButton onClick={handleClick}>
    <SettingsIcon />
  </IconButton>
</>
);
