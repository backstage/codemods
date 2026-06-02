import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox label={fieldLabel} checked={agreed} onChange={setAgreed} />
);
