import { Checkbox as BuiCheckbox } from '@backstage/ui';

export const Example = () => (
  <BuiCheckbox isSelected={agreed} onChange={setAgreed}>
  Accept
</BuiCheckbox>
);
