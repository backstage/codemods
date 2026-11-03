import Autocomplete from '@material-ui/lab/Autocomplete';
import TextField from '@material-ui/core/TextField';

const EntityPicker = ({
  value,
  onChange,
  options,
}: {
  value: { id: string; name: string } | null;
  onChange: (value: { id: string; name: string } | null) => void;
  options: { id: string; name: string }[];
}) => (
  <Autocomplete
    options={options}
    getOptionLabel={(option) => option.name}
    value={value}
    onChange={(_event, next) => onChange(next)}
    renderInput={(params) => <TextField {...params} label="Entity" />}
  />
);
