import Paper from '@material-ui/core/Paper';
import { CardBody, CardFooter, CardHeader } from '@backstage/ui';

const MyComponent = () => (
  <Paper>
    <CardHeader>Title</CardHeader>
    <CardBody>Body</CardBody>
    <CardFooter>Actions</CardFooter>
  </Paper>
);
