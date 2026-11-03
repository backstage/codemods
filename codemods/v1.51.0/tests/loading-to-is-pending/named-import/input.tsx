import { Alert, Button, ButtonIcon, Table, TableRoot } from '@backstage/ui';

export const Example = () => (
  <>
    <Alert loading={isLoading}>Warning</Alert>
    <Button loading={isSubmitting}>Save</Button>
    <ButtonIcon loading={isRefreshing} icon="refresh" aria-label="Refresh" />
    <Table loading={isFetching} />
    <TableRoot loading={isPending}>Content</TableRoot>
  </>
);
