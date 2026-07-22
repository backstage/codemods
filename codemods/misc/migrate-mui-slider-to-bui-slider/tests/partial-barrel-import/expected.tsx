import { Typography } from '@material-ui/core';
import { Slider } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Typography>Volume</Typography>
    <Slider minValue={10} maxValue={90} value={50} />
  </>
);
