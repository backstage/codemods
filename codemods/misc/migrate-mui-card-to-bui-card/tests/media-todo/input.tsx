import Card from '@material-ui/core/Card';
import CardMedia from '@material-ui/core/CardMedia';
import CardContent from '@material-ui/core/CardContent';

const MyCard = () => (
  <Card>
    <CardMedia image="/cover.png" title="Cover" />
    <CardContent>Hello</CardContent>
  </Card>
);
