import { useTable } from '@backstage/ui';

function DataList({ items }) {
  /* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */
  const { data, paginationProps } = useTable({ data: items });

  return <pre>{JSON.stringify(data)}</pre>;
}
