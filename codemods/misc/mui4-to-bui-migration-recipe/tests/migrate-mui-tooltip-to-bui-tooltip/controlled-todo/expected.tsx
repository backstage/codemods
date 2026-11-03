import { Tooltip, TooltipTrigger } from '@backstage/ui';

const MyComponent = () => (
  <TooltipTrigger isOpen={isOpen} onOpenChange={open => !open && handleClose()}>
  <span>Hover me</span>
  <Tooltip>Info</Tooltip>
</TooltipTrigger>
);
