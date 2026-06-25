import { withStyles } from '@material-ui/core/styles';

// TODO(backstage-codemod): migrate withStyles to CSS Modules manually
const StyledDiv = withStyles({
  root: { padding: 16 },
})('div');
