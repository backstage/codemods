


import { Button, Menu, MenuItem, MenuTrigger } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    
    <MenuTrigger isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><Button>Open menu</Button><Menu><MenuItem onAction={handleAction}>Action</MenuItem></Menu></MenuTrigger>
  </>
);
