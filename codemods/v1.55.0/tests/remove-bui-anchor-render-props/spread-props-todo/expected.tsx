import { Link, MenuItem } from '@backstage/ui'

const linkProps = { href: '/catalog' }
const safeSpread = { href: '/docs' }

export function Example() {
  return (
    <>
      <Link /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ {...linkProps}>Catalog</Link>
      <MenuItem /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ {...{ render: <a />, href: '/menu' }}>Menu</MenuItem>
      <Link /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ {...safeSpread}>Docs</Link>
    </>
  )
}
