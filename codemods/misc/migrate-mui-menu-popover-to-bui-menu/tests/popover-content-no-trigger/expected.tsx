import Popover from '@material-ui/core/Popover';

const MyComponent = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <>
  {/* TODO(backstage-codemod): finish menu host migration manually (no-trigger-element) */}
  <Popover open={open} onClose={onClose}>
    <div>Popover body</div>
  </Popover>
</>
);
