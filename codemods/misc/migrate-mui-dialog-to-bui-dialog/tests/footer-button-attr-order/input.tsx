import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Confirm</DialogTitle>
    <DialogContent>Are you sure?</DialogContent>
    <DialogActions>
      <button type="button" className="cancel" onClick={onClose}>
        Cancel
      </button>
    </DialogActions>
  </Dialog>
);
