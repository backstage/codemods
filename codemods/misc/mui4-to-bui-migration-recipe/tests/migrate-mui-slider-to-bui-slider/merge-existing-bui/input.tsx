import Slider from '@material-ui/core/Slider';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Slider min={0} max={100} value={val} />
  </>
);
