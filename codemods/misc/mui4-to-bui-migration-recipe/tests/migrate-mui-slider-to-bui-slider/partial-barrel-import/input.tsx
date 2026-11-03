import { Slider, Typography } from '@material-ui/core';

const MyComponent = () => (
  <>
    <Typography>Volume</Typography>
    <Slider min={10} max={90} value={50} />
  </>
);
