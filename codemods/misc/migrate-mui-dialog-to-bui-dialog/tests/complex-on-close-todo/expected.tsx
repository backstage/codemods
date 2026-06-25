



const MyDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  {/* TODO(backstage-codemod): verify dialog width, dismiss behavior, or custom close logic manually (complex-onClose) */}
<Dialog open={open} onClose={() => { cleanup(); onClose(); }}>
    <DialogTitle>Complex</DialogTitle>
    <DialogContent>Body</DialogContent>
  </Dialog>
);
