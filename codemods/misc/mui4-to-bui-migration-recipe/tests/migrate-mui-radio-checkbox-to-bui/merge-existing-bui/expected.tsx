


import { Button, Radio, RadioGroup } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <RadioGroup value={value} onChange={handleChange}><Radio value="on">On</Radio><Radio value="off">Off</Radio></RadioGroup>
  </>
);
