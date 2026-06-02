import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox label="Accept terms" checked={agreed} onChange={setAgreed} />
);
