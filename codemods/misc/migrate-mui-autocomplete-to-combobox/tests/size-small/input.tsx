import Autocomplete from '@material-ui/lab/Autocomplete';
import TextField from '@material-ui/core/TextField';

const FruitPicker = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) => (
  <Autocomplete
    size="small"
    options={['Apple', 'Banana', 'Cherry']}
    getOptionLabel={(option) => option}
    value={value}
    onChange={(_event, next) => onChange(next)}
    renderInput={(params) => <TextField {...params} label="Fruit" />}
  />
);
