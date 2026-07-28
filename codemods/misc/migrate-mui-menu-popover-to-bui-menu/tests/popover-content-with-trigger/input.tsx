import Popover from '@material-ui/core/Popover';
import { Button } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    <Button>Open popover</Button>
    <Popover open={open} onClose={onClose}>
      <div>Popover body</div>
    </Popover>
  </>
);
