import * as UI from '@backstage/ui'

export function Example() {
  return (
    <>
      <UI.MenuItem href="/menu" render={<a />}>Menu</UI.MenuItem>
      <UI.SearchAutocompleteItem href="/search" render={<a />}>Search</UI.SearchAutocompleteItem>
    </>
  )
}
