import { Dialog, DialogTitle, DialogContent, Button } from '@material-ui/core';

const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Info</DialogTitle>
      <DialogContent>Details here</DialogContent>
    </Dialog>
    <Button>Keep me</Button>
  </>
);
