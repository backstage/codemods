import Grid from '@material-ui/core/Grid';

const spacing = 3;
const columns = 12;

const MyComponent = () => (
  <Grid container spacing={spacing}>
    <Grid item xs={columns}>
      Content
    </Grid>
  </Grid>
);
