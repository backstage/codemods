import { Link } from '@backstage/core-components';
import MuiLink from '@material-ui/core/Link';

const Mixed = () => (
  <>
    <Link to="/docs">Docs</Link>
    <MuiLink href="/other">Other</MuiLink>
  </>
);
