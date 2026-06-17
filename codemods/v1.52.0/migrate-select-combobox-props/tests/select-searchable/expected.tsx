import { Select } from '@backstage/ui';

export function OwnerFilter() {
  return (
    <Select search={{ placeholder: "Search owners" }} options={[]} />
  );
}
