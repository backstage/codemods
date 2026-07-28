import Autocomplete from '@material-ui/lab/Autocomplete';
import TextField from '@material-ui/core/TextField';

const ResearchBox = ({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (value: string) => void;
}) => (
  <>
  {/* TODO(backstage-codemod): verify Autocomplete migration manually — ambiguous Combobox vs SearchAutocomplete */}
  <Autocomplete
    options={[]}
    freeSolo
    inputValue={query}
    onInputChange={(_event, next) => setQuery(next)}
    renderInput={(params) => <TextField {...params} placeholder="Research topics..." />}
  />
</>
);
