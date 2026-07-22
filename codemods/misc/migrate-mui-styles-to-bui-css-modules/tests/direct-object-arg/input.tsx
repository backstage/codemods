import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  wrapper: {
    padding: 0,
    margin: 0,
  },
});

const MyComponent = () => {
  const classes = useStyles();
  return <div className={classes.wrapper} />;
};
