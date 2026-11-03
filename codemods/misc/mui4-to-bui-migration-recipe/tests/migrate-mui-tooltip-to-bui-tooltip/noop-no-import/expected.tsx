import { Tooltip, TooltipTrigger } from '@backstage/ui';

const MyComponent = () => (
  <TooltipTrigger>
    <span>Hover</span>
    <Tooltip>Info</Tooltip>
  </TooltipTrigger>
);
