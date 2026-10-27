import { Link } from '@backstage/ui'

export function Example() {
  return <Link href="/catalog" render={<a target="_blank" />}>Catalog</Link>
}
