import { Typography } from '@material-ui/core';
import { Menu, MenuItem, MenuTrigger } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    
    <MenuTrigger isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><button onClick={() => {}}>Open</button><Menu><MenuItem onAction={handleEdit}>Edit</MenuItem></Menu></MenuTrigger>
    <Typography>Keep me</Typography>
  </>
);
