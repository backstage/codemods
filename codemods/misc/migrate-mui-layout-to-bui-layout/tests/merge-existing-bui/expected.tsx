import Box from '@material-ui/core/Box';
import { Flex, Grid } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Flex direction="row">Existing</Flex>
    <Flex direction="column" align="center">{children}</Flex>
  </>
);
