import Grid from '@material-ui/core/Grid';

export const DisabledContainer = () => (
  <Grid container={false} spacing={3}>
    Content
  </Grid>
);

export const DisabledItem = () => (
  <Grid item={false} xs={12} md={6}>
    Content
  </Grid>
);
