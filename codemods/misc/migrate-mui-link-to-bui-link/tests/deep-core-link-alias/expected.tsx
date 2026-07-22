import Link from '@backstage/core-components/Link';
import { Link as BuiLink } from '@backstage/ui';

const Mixed = () => (
  <>
    <Link to="/docs">Docs</Link>
    <BuiLink href="/other">Other</BuiLink>
  </>
);
