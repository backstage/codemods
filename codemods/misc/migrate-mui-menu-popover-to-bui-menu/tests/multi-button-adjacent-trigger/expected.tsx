

import { Button, Menu, MenuItem, MenuTrigger } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    <Button>Unrelated</Button>
    <span>spacer</span>
    
    <MenuTrigger isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><Button>Open menu</Button><Menu><MenuItem onAction={handleEdit}>Edit</MenuItem></Menu></MenuTrigger>
  </>
);
