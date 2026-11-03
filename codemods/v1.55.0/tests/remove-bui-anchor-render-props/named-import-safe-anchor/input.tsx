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
      <ButtonLink href="/docs" target="_blank" render={<a />}>Docs</ButtonLink>
      <ComboboxItem id="catalog" textValue="Catalog" href="/catalog" render={<a />}>Catalog</ComboboxItem>
      <Link href="/catalog" download="catalog.json" render={<a />}>Catalog</Link>
      <MenuItem href="/menu" render={<a />}>Menu</MenuItem>
      <MenuListBoxItem href="/list" render={<a />}>List</MenuListBoxItem>
      <SearchAutocompleteItem href="/search" render={<a />}>Search</SearchAutocompleteItem>
      <SelectItem id="select" textValue="Select" href="/select" render={<a />}>Select</SelectItem>
      <Tab id="overview" href="/overview" render={<a />}>Overview</Tab>
    </>
  )
}
