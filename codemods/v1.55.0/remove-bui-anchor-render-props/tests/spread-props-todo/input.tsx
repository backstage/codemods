import { Link, MenuItem } from '@backstage/ui'

const linkProps = { href: '/catalog' }
const safeSpread = { href: '/docs' }

export function Example() {
  return (
    <>
      <Link {...linkProps}>Catalog</Link>
      <MenuItem {...{ render: <a />, href: '/menu' }}>Menu</MenuItem>
      <Link {...safeSpread}>Docs</Link>
    </>
  )
}
