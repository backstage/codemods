import { Link as BuiLink, Tab as BuiTab } from '@backstage/ui'

export function Example() {
  return (
    <>
      <BuiLink href="/catalog">Catalog</BuiLink>
      <BuiTab id="docs" href="/docs">Docs</BuiTab>
    </>
  )
}
