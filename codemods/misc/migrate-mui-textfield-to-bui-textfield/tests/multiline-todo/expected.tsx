import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <>
{/* TODO(backstage-codemod): finish TextField migration manually (multiline, rows) */}
<TextField label="Description" multiline rows={4} value={desc} onChange={e => setDesc(e.target.value)} />
</>
);
