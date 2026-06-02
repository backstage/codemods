import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox isDisabled={!canEdit} isRequired defaultSelected>
  {fieldLabel}
</Checkbox>
);
