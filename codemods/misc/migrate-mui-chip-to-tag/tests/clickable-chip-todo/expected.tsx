import Chip from '@material-ui/core/Chip';

const MyComponent = () => (
  <>{/* TODO(backstage-codemod): verify interactive chip migration manually */}
<Chip label="Click me" clickable onClick={() => navigate('/page')} /></>
);
