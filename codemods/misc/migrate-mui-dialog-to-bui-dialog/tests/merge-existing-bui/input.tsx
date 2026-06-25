import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import { Button } from '@backstage/ui';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Action</DialogTitle>
    <DialogContent><Button>Click</Button></DialogContent>
  </Dialog>
);
