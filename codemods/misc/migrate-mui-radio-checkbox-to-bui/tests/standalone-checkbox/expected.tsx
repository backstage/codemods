import { Checkbox } from '@backstage/ui';

const MyComponent = () => (
  <Checkbox isSelected={enabled} onChange={toggleEnabled} name="enabled" />
);
