import { Slider } from '@backstage/ui';

const MyComponent = () => (
  <Slider minValue={0} maxValue={100} value={value} onChange={next => setValue(next as number)} />
);
