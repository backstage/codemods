import { Link, MenuItem } from '@backstage/ui'
import { RouterLink } from './RouterLink'

const renderLink = (props: { href?: string }) => <a href={props.href} data-analytics-id="catalog" />

export function Example() {
  return (
    <>
      <Link href="/catalog" render={RouterLink}>Catalog</Link>
      <MenuItem href="/menu" render={renderLink}>Menu</MenuItem>
    </>
  )
}
