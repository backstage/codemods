import * as UI from '@backstage/ui';

export const Example = () => (
  <>
    <UI.Button isPending={isSubmitting}>Save</UI.Button>
    <UI.Table isPending={isFetching} />
  </>
);
