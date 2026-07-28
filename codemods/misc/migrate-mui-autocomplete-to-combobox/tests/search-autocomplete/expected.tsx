import { SearchAutocomplete } from '@backstage/ui';


const SearchBox = ({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (value: string) => void;
}) => (
  <SearchAutocomplete inputValue={query} onInputChange={setQuery} placeholder="Search entities..." size="medium" />
);
