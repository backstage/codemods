import { Tooltip, TooltipTrigger } from '@backstage/ui';

const MyComponent = () => (
  {/* TODO(backstage-codemod): verify Tooltip placement mapping manually */}
<TooltipTrigger>
  <span>Hover</span>
  <Tooltip>Info</Tooltip>
</TooltipTrigger>
);
