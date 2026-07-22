import { Button } from '@material-ui/core';
import { Radio, RadioGroup } from '@backstage/ui';

const MyComponent = () => (
  <>
    <RadioGroup value={val} onChange={setVal}><Radio value="x">X</Radio><Radio value="y">Y</Radio></RadioGroup>
    <Button>Save</Button>
  </>
);
