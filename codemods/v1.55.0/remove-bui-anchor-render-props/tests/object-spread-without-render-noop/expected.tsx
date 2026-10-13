import { Link } from '@backstage/ui'

export function Example() {
  return <Link {...{ href: '/catalog', target: '_blank' }}>Catalog</Link>
}
