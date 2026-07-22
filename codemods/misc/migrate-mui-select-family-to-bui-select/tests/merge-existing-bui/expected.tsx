



import { Button, Select } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Select label={"Mode"} size="medium" selectedKey={mode} onSelectionChange={key => setMode(key as string)} options={[{ id: 'auto', label: 'Auto' }, { id: 'manual', label: 'Manual' }]} />
  </>
);
