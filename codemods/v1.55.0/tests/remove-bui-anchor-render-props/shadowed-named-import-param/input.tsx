import { Link } from '@backstage/ui'

function Shadowed({ Link }) {
  return <Link href="/shadowed" render={<a />}>Shadowed</Link>
}

export function Example() {
  return (
    <>
      <Link href="/imported" render={<a />}>Imported</Link>
      <Shadowed Link={Link} />
    </>
  )
}
