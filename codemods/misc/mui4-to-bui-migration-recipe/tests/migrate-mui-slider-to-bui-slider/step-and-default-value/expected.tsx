import { Slider } from '@backstage/ui';

const MyComponent = () => (
  <Slider minValue={0} maxValue={50} step={5} defaultValue={25} />
);
