import Popover from '@material-ui/core/Popover';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Popover open={open} onClose={onClose}>
    <div>Popover body</div>
  </Popover>
);
