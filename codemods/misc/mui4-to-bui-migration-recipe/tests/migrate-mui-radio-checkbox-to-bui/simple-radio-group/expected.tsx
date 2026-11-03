import { Radio, RadioGroup } from '@backstage/ui';



const MyComponent = () => (
  <RadioGroup value={value} onChange={handleChange}><Radio value="a">Option A</Radio><Radio value="b">Option B</Radio></RadioGroup>
);
