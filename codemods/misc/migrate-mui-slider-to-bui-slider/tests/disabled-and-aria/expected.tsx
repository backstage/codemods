import { Slider } from '@backstage/ui';

const MyComponent = () => (
  <Slider minValue={0} maxValue={100} isDisabled aria-label="Volume" value={volume} />
);
