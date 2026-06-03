import { ColumnConfig } from '@backstage/ui';

const columns: ColumnConfig<{ name: string }>[] = [
  { id: 'name', label: 'Name', cell: (item) => item.name },
];
