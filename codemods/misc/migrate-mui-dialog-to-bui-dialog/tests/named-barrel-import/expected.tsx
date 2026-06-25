import { Dialog, DialogBody, DialogHeader } from '@backstage/ui';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><DialogHeader>Info</DialogHeader><DialogBody>Details here</DialogBody></Dialog>
);
