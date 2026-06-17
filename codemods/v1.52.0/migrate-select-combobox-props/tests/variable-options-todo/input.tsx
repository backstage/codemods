import { Select } from '@backstage/ui';

const statuses = [{ value: 'open', label: 'Open' }];

export function StatusFilter() {
  return <Select options={statuses} />;
}
