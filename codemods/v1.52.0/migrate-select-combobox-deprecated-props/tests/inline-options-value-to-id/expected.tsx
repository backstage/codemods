import { Select } from '@backstage/ui';

export function StatusFilter() {
  return (
    <Select
      options={[
        { id: 'active', label: 'Active' },
        { id: 'inactive', label: 'Inactive' },
      ]}
    />
  );
}
