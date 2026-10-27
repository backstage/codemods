import { Link } from '@backstage/ui'

export function Example() {
  return <Link href="/catalog" /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ render={<a target="_blank" />}>Catalog</Link>
}
