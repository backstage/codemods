import { Box } from '@backstage/ui';

export const Example = ({ level }: { level: string }) => (
  <Box surface={level}>Dynamic</Box>
);
