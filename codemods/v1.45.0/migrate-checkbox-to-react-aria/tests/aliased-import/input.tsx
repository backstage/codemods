import { Checkbox as BuiCheckbox } from '@backstage/ui';

export const Example = () => (
  <BuiCheckbox label="Accept" checked={agreed} onChange={setAgreed} />
);
