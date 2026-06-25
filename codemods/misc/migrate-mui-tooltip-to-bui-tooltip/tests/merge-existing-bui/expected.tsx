
import { Button, Tooltip, TooltipTrigger } from '@backstage/ui';

const MyComponent = () => (
  <TooltipTrigger>
  <Button variant="primary">Save</Button>
  <Tooltip>Save changes</Tooltip>
</TooltipTrigger>
);
