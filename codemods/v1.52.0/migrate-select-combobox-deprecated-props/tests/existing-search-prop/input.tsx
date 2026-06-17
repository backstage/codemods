import { Select } from '@backstage/ui';

export function OwnerFilter() {
  return (
    <Select searchable searchPlaceholder="Find..." search={{ mode: 'server' }} options={[]} />
  );
}
