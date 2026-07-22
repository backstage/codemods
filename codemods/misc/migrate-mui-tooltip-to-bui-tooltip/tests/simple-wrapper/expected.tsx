import { Tooltip, TooltipTrigger } from '@backstage/ui';

const MyComponent = () => (
  <TooltipTrigger>
  <IconButton aria-label="more">
      <MoreVertIcon />
    </IconButton>
  <Tooltip>More actions</Tooltip>
</TooltipTrigger>
);
