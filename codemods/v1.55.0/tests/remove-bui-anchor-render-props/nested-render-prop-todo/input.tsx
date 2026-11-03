import { Link } from '@backstage/ui'
import { RouterLink } from './RouterLink'

export function Example() {
  return <Link href="/catalog" render={<RouterLink render={<a />} />}>Catalog</Link>
}
