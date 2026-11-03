import { Link } from '@backstage/ui'

const renderLink = (props: { href?: string }) => <a href={props.href} />

export function Example() {
  return (
    <>
      <Link href="/catalog" /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ render={renderLink}>Catalog</Link>
      <Link /* TODO(backstage-codemod): review render migration manually (custom render prop or spread props) */ {...{ render: <a />, href: '/docs' }}>Docs</Link>
      <Link href="/clean">Clean</Link>
    </>
  )
}
