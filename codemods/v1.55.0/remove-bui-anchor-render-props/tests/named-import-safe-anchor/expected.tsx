import {
  ButtonLink,
  ComboboxItem,
  Link,
  MenuItem,
  MenuListBoxItem,
  SearchAutocompleteItem,
  SelectItem,
  Tab,
} from '@backstage/ui'

export function Example() {
  return (
    <>
      <ButtonLink href="/docs" target="_blank">Docs</ButtonLink>
      <ComboboxItem id="catalog" textValue="Catalog" href="/catalog">Catalog</ComboboxItem>
      <Link href="/catalog" download="catalog.json">Catalog</Link>
      <MenuItem href="/menu">Menu</MenuItem>
      <MenuListBoxItem href="/list">List</MenuListBoxItem>
      <SearchAutocompleteItem href="/search">Search</SearchAutocompleteItem>
      <SelectItem id="select" textValue="Select" href="/select">Select</SelectItem>
      <Tab id="overview" href="/overview">Overview</Tab>
    </>
  )
}
