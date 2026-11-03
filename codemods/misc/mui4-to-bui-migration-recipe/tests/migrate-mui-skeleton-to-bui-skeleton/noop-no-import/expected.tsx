import { Skeleton } from '@backstage/ui';
import CircularProgress from '@material-ui/core/CircularProgress';

const MyComponent = () => (
  <>
    <Skeleton width={100} height={16} />
    <CircularProgress />
  </>
);
