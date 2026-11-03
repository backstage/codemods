import { useTable } from '@backstage/ui';

function DataList({ items }) {
  const { data, paginationProps } = useTable({ data: items });

  return <pre>{JSON.stringify(data)}</pre>;
}
