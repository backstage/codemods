import { Table } from '@backstage/core-components';

export function MyTable() {
  return (
    <Table
      options={{
        toolbar: { searchPlaceholder: 'Filter entities' },
      }}
      columns={[]}
      data={[]}
    />
  );
}
