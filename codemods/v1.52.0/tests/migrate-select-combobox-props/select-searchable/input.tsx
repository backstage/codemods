import { Select } from '@backstage/ui';

export function OwnerFilter() {
  return (
    <Select searchable searchPlaceholder="Search owners" options={[]} />
  );
}
