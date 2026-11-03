import Tooltip from '@material-ui/core/Tooltip';

const MyComponent = () => (
  <Tooltip title="Info" open={isOpen} onClose={handleClose}>
    <span>Hover me</span>
  </Tooltip>
);
