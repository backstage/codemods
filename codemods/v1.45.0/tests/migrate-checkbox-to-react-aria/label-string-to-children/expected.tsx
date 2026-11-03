import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox isSelected={agreed} onChange={setAgreed}>
    Accept terms
  </Checkbox>
);
