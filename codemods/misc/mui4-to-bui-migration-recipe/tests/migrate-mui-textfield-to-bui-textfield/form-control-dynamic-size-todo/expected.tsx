import FormControl from '@material-ui/core/FormControl';
import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <FormControl size={dense ? 'small' : 'medium'}>
    <>
  {/* TODO(backstage-codemod): finish TextField migration manually (size) */}
  <TextField label="Title" value={value} onChange={e => setValue(e.target.value)} />
</>
  </FormControl>
);
