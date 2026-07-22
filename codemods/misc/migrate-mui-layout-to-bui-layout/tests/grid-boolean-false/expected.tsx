import Grid from '@material-ui/core/Grid';

export const DisabledContainer = () => (
  <>
  {/* TODO(backstage-codemod): verify BUI layout mapping manually */}
  <Grid container={false} spacing={3}>
    Content
  </Grid>
</>
);

export const DisabledItem = () => (
  <>
  {/* TODO(backstage-codemod): verify BUI layout mapping manually */}
  <Grid item={false} xs={12} md={6}>
    Content
  </Grid>
</>
);
