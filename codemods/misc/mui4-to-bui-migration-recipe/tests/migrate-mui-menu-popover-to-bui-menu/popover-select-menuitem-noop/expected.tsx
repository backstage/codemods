
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import { Button, DialogTrigger, Popover } from '@backstage/ui';

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
    
    <DialogTrigger isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><Button>Open popover</Button><Popover><Select value={value}>
        <MenuItem value="a">A</MenuItem>
        <MenuItem value="b">B</MenuItem>
      </Select></Popover></DialogTrigger>
  </>
);
