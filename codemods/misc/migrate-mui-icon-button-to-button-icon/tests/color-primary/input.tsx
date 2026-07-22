import IconButton from '@material-ui/core/IconButton';

const MyComponent = () => (
  <IconButton aria-label="favorite" color="primary" onClick={handleFavorite}>
    <FavoriteIcon />
  </IconButton>
);
