import { Alert, Button, ButtonIcon, Table, TableRoot } from '@backstage/ui';

export const Example = () => (
  <>
    <Alert isPending={isLoading}>Warning</Alert>
    <Button isPending={isSubmitting}>Save</Button>
    <ButtonIcon isPending={isRefreshing} icon="refresh" aria-label="Refresh" />
    <Table isPending={isFetching} />
    <TableRoot isPending={isPending}>Content</TableRoot>
  </>
);
