
import { Button, DialogTrigger, Popover } from '@backstage/ui';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    
    <DialogTrigger isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><Button>Open popover</Button><Popover><div>Popover body</div></Popover></DialogTrigger>
  </>
);
