import { Select } from '@backstage/ui';

const statuses = [{ value: 'open', label: 'Open' }];

export function StatusFilter() {
  return <Select /* TODO(backstage-codemod): migrate option 'value' to 'id' — see https://backstage.io/docs/releases/v1.52.0 */ options={statuses} />;
}
