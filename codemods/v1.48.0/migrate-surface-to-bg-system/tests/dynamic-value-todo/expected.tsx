import { Box } from '@backstage/ui';

export const Example = ({ level }: { level: string }) => (
  <Box bg /* TODO(backstage-codemod): verify dynamic surface→bg value mapping */={level}>Dynamic</Box>
);
