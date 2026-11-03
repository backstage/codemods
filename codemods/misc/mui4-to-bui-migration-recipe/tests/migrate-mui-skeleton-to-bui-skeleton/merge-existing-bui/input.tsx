import Skeleton from '@material-ui/core/Skeleton';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <Skeleton width={120} height={20} />
  </>
);
