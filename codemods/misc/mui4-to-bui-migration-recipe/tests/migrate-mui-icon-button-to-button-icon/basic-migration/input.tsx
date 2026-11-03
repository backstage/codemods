import IconButton from '@material-ui/core/IconButton';

const MyComponent = () => (
  <IconButton aria-label="delete" disabled={!canDelete} onClick={handleDelete}>
    <DeleteIcon />
  </IconButton>
);
