import { Table, useTable, TableHeader, TableBody, TablePagination } from '@backstage/ui';

function MyComponent({ items }) {
  const { data, paginationProps } = useTable({ data: items, pagination: { pageSize: 10 } });

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
