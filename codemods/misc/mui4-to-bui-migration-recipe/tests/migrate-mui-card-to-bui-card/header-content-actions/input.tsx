import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardContent from '@material-ui/core/CardContent';
import CardActions from '@material-ui/core/CardActions';

const MyCard = () => (
  <Card>
    <CardHeader title="Details" />
    <CardContent>Body copy</CardContent>
    <CardActions>
      <button type="button">Save</button>
    </CardActions>
  </Card>
);
