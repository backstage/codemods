import Slider from '@material-ui/core/Slider';

const MyComponent = () => (
  <Slider min={0} max={100} value={value} onChange={(_e, next) => setValue(next as number)} />
);
