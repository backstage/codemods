import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle>Wide</DialogTitle>
    <DialogContent>Content</DialogContent>
  </Dialog>
);
