import { Button } from '@material-ui/core';
import { Select } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Select label={"Size"} size="medium" selectedKey={size} onSelectionChange={key => setSize(key as string)} options={[{ id: 'sm', label: 'Small' }, { id: 'lg', label: 'Large' }]} />
    <Button>Save</Button>
  </>
);
