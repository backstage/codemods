import { Checkbox } from '@backstage/ui';

export const Example = () => (
  <Checkbox label={fieldLabel} disabled={!canEdit} required defaultChecked />
);
