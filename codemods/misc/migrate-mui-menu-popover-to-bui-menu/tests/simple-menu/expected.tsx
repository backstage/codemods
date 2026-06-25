


const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <MenuTrigger isOpen={open} onOpenChange={isOpen => !isOpen && onClose()}><Menu><MenuItem onAction={handleEdit}>Edit</MenuItem><MenuItem onAction={handleDelete}>Delete</MenuItem></Menu></MenuTrigger>
);
