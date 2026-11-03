import { Button } from '@material-ui/core';
import { Alert } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Alert status="info" icon description="Note" />
    <Button>Keep me</Button>
  </>
);
