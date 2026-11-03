import IconButton from '@material-ui/core/IconButton';

const MyComponent = () => (
  <IconButton aria-label="copy" className="custom-btn" data-testid="copy-btn" onClick={handleCopy}>
    <CopyIcon />
  </IconButton>
);
