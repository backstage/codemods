import { TextField } from '@backstage/ui';

const MyComponent = () => (
  {/* TODO(backstage-codemod): finish TextField migration manually (fullWidth) */}
<TextField isDisabled label="Status" placeholder="N/A" value={status} />
);
