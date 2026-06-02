import { Box } from '@backstage/ui';

export const Example = ({ level }: { level: string }) => (
  <Box bg={level}>Dynamic</Box>
);
