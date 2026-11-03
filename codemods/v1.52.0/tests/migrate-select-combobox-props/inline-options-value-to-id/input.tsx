import { Select } from '@backstage/ui';

export function StatusFilter() {
  return (
    <Select
      options={[
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ]}
    />
  );
}
