import { Link as BuiLink, Tab as BuiTab } from '@backstage/ui'

export function Example() {
  return (
    <>
      <BuiLink href="/catalog" render={<a />}>Catalog</BuiLink>
      <BuiTab id="docs" href="/docs" render={<a />}>Docs</BuiTab>
    </>
  )
}
