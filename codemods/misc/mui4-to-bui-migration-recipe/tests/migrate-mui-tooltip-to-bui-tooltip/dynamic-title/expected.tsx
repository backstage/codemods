import { Tooltip, TooltipTrigger } from '@backstage/ui';

const MyComponent = ({ label }: { label: string }) => (
  <TooltipTrigger>
  <span>{label}</span>
  <Tooltip>{label}</Tooltip>
</TooltipTrigger>
);
