

import { Checkbox, CheckboxGroup } from '@backstage/ui';

const MyComponent = () => (
  <CheckboxGroup><Checkbox isSelected={enabled} onChange={toggleEnabled}>Enabled</Checkbox><Checkbox isSelected={visible} onChange={toggleVisible}>Visible</Checkbox></CheckboxGroup>
);
