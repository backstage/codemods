import Link from '@material-ui/core/Link';
import { Link as RouterLink } from 'react-router-dom';

const Nav = () => (
  <>
  {/* TODO(backstage-codemod): verify Link intent manually (component, to) */}
  <Link component={RouterLink} to="/catalog">
    Catalog
  </Link>
</>
);
