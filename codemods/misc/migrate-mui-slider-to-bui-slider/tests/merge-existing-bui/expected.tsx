
import { Button, Slider } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Slider minValue={0} maxValue={100} value={val} />
  </>
);
