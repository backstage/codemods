import Box from '@material-ui/core/Box';
import { Flex, Grid } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Flex direction="row">Existing</Flex>
    <Box display="flex" flexDirection="column" alignItems="center">
      {children}
    </Box>
  </>
);
