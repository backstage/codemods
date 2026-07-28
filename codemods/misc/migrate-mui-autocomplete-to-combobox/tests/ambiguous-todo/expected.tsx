import Autocomplete from '@material-ui/lab/Autocomplete';
import TextField from '@material-ui/core/TextField';

const Ambiguous = ({
  value,
  setValue,
  setQuery,
}: {
  value: string | null;
  setValue: (value: string | null) => void;
  setQuery: (value: string) => void;
}) => (
  <>
  {/* TODO(backstage-codemod): verify Autocomplete migration manually — ambiguous Combobox vs SearchAutocomplete */}
  <Autocomplete
    options={['one', 'two']}
    value={value}
    onChange={(_event, next) => setValue(next)}
    onInputChange={(_event, next) => setQuery(next)}
    renderInput={(params) => <TextField {...params} label="Maybe search" />}
  />
</>
);
