import Popover from '@material-ui/core/Popover';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import { Button } from '@backstage/ui';

const MyComponent = ({
  open,
  onClose,
  value,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
}) => (
  <>
    <Button>Open popover</Button>
    <Popover open={open} onClose={onClose}>
      <Select value={value}>
        <MenuItem value="a">A</MenuItem>
        <MenuItem value="b">B</MenuItem>
      </Select>
    </Popover>
  </>
);
