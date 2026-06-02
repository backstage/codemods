import { Table, useTable } from '@backstage/ui';

function MyComponent({ items }) {
  /* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */
  const { tableProps } = useTable({ mode: 'complete', getData: () => items });

  return (
    <div>
      <Table aria-label="My table">
        {/* TODO(backstage-codemod): Migrate TableHeader/TableBody/TablePagination to new Table API */}
        <TableHeader>
          <Column>Name</Column>
          <Column>Status</Column>
        </TableHeader>
        {/* TODO(backstage-codemod): Migrate TableHeader/TableBody/TablePagination to new Table API */}
        <TableBody items={data}>
          {(item) => (
            <Row>
              <Cell>{item.name}</Cell>
              <Cell>{item.status}</Cell>
            </Row>
          )}
        </TableBody>
      </Table>
      {/* TODO(backstage-codemod): Migrate TableHeader/TableBody/TablePagination to new Table API */}
      <TablePagination {...paginationProps} />
    </div>
  );
}
