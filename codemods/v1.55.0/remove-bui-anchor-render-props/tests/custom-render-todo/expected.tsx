import { Link, MenuItem } from '@backstage/ui'
import { RouterLink } from './RouterLink'

const renderLink = (props: { href?: string }) => <a href={props.href} data-analytics-id="catalog" />

export function Example() {
  return (
    <>
      <Link href="/catalog" /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ render={RouterLink}>Catalog</Link>
      <MenuItem href="/menu" /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ render={renderLink}>Menu</MenuItem>
    </>
  )
}
