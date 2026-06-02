import { Table, useTable } from '@backstage/ui';

function MyComponent({ items }) {
  /* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */
  const { tableProps } = useTable({ mode: 'complete', getData: () => items });

  return (
    <div>
      <Table aria-label="My table">
        <TableHeader>
          <Column>Name</Column>
          <Column>Status</Column>
        </TableHeader>
        <TableBody items={data}>
          {(item) => (
            <Row>
              <Cell>{item.name}</Cell>
              <Cell>{item.status}</Cell>
            </Row>
          )}
        </TableBody>
      </Table>
      <TablePagination {...paginationProps} />
    </div>
  );
}
