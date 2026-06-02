import * as UI from '@backstage/ui';

export const Example = () => (
  <UI.Checkbox isSelected={agreed} onChange={setAgreed}>
    Accept
  </UI.Checkbox>
);
