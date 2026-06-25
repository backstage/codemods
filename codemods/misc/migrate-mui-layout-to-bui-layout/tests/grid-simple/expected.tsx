
import { Grid } from '@backstage/ui';

const MyComponent = () => (
  <Grid.Root columns={{ sm: '12' }} gap="6">
    <Grid.Item colSpan={{ xs: '12', md: '6' }}>
      Content
    </Grid.Item>
  </Grid.Root>
);
