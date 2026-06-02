import { ColumnConfig , CellText} from '@backstage/ui';

const columns: ColumnConfig<{ name: string }>[] = [
  { id: 'name', label: 'Name', cell: (item) => <CellText title={item.name} /> },
];
