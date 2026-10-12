import { Link } from '@backstage/ui'
import { RouterLink } from './RouterLink'

export function Example() {
  return <Link href="/catalog" /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ render={<RouterLink render={<a />} />}>Catalog</Link>
}
