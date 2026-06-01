import * as UI from '@backstage/ui';

export const Example = () => (
  <>
    <UI.Button loading={isSubmitting}>Save</UI.Button>
    <UI.Table loading={isFetching} />
  </>
);
