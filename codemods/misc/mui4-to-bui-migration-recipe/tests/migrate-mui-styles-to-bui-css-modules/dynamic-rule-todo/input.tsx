import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  root: props => ({ color: props.active ? theme.palette.primary.main : theme.palette.text.secondary }),
}));

const MyComponent = (props: any) => {
  const classes = useStyles(props);
  return <div className={classes.root} />;
};
