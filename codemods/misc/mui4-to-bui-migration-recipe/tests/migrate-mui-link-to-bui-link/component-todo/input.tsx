import Link from '@material-ui/core/Link';
import { Link as RouterLink } from 'react-router-dom';

const Nav = () => (
  <Link component={RouterLink} to="/catalog">
    Catalog
  </Link>
);
