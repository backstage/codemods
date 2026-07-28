import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <>
  {/* TODO(backstage-codemod): finish TextField migration manually (size) */}
  <TextField label="Title" size={density} value={title} onChange={e => setTitle(e.target.value)} />
</>
);
