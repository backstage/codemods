import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <>
{/* TODO(backstage-codemod): finish TextField migration manually (complex-onChange) */}
<TextField label="Name" value={name} onChange={handleNameChange} />
</>
);
