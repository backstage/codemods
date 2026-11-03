import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox label="Accept terms" checked={agreed} disabled={!canEdit} required defaultChecked onChange={setAgreed} />
);
