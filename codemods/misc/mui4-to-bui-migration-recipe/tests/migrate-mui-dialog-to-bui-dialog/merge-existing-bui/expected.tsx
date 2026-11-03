


import { Button, Dialog, DialogBody, DialogHeader } from '@backstage/ui';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><DialogHeader>Action</DialogHeader><DialogBody><Button>Click</Button></DialogBody></Dialog>
);
