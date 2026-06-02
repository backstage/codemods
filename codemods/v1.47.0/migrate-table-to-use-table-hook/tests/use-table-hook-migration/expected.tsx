import { useTable } from '@backstage/ui';

function DataList({ items }) {
  /* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */
  const { tableProps } = useTable({ mode: 'complete', getData: () => items });

  return <pre>{JSON.stringify(data)}</pre>;
}
