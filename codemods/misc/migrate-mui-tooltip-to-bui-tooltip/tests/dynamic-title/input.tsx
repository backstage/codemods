import Tooltip from '@material-ui/core/Tooltip';

const MyComponent = ({ label }: { label: string }) => (
  <Tooltip title={label}>
    <span>{label}</span>
  </Tooltip>
);
