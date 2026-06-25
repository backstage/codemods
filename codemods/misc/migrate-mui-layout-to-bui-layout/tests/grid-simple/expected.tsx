import Grid from '@material-ui/core/Grid';
import { Grid } from '@backstage/ui';

const MyComponent = () => (
  <Grid.Root columns={{ sm: '12' }} gap="6"><Grid item xs={12} md={6}>
      Content
    </Grid></Grid.Root>
);
