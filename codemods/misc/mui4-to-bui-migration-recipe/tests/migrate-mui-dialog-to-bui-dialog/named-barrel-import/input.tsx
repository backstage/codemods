import { Dialog, DialogTitle, DialogContent } from '@material-ui/core';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Info</DialogTitle>
    <DialogContent>Details here</DialogContent>
  </Dialog>
);
