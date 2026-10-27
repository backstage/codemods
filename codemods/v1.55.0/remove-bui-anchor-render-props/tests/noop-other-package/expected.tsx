import { Link, Tab } from '@acme/ui'

export function Example() {
  return (
    <>
      <Link href="/catalog" render={<a />}>Catalog</Link>
      <Tab id="overview" href="/overview" render={<a />}>Overview</Tab>
    </>
  )
}
