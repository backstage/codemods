import * as UI from '@backstage/ui'

export function Example() {
  return (
    <>
      <UI.MenuItem href="/menu">Menu</UI.MenuItem>
      <UI.SearchAutocompleteItem href="/search">Search</UI.SearchAutocompleteItem>
    </>
  )
}
