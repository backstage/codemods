import { Button, Dialog, DialogBody, DialogFooter, DialogHeader } from '@backstage/ui';




const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><DialogHeader>Confirm</DialogHeader><DialogBody>Are you sure?</DialogBody><DialogFooter><Button slot="close" onPress={onClose} type="button" className="cancel">
        Cancel
      </Button></DialogFooter></Dialog>
);
