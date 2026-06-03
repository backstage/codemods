import { ColumnConfig , Column} from '@backstage/ui';

const columns: ColumnConfig<{ name: string }>[] = [
  { id: 'name', label: 'Name', cell: (item) => <span>{item.name}</span>, header: () => <Column>Name</Column> },
];
