import Slider from '@material-ui/core/Slider';

const MyComponent = () => (
  <Slider min={0} max={100} onChangeCommitted={(_e, val) => save(val)} />
);
