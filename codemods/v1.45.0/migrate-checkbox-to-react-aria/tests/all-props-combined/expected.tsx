import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox isSelected={agreed} isDisabled={!canEdit} isRequired defaultSelected onChange={setAgreed}>
    Accept terms
  </Checkbox>
);
