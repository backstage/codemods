import * as UI from '@backstage/ui';

export const Example = () => (
  <UI.Checkbox label="Accept" checked={agreed} onChange={setAgreed} />
);
