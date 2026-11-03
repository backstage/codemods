import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  header: {
    color: theme.palette.text.primary,
    padding: theme.spacing(1),
  },
  body: {
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.background.default,
  },
}));

const MyComponent = () => {
  const classes = useStyles();
  return (
    <div>
      <h1 className={classes.header}>Title</h1>
      <p className={classes.body}>Content</p>
    </div>
  );
};
