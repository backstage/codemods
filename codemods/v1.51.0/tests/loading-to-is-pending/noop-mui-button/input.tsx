import { Button } from '@mui/material';
import { Button as BuiButton } from '@backstage/ui';

export const Example = () => (
  <>
    <Button loading>Save</Button>
    <BuiButton loading={isSubmitting}>Save</BuiButton>
  </>
);
