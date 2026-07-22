import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardContent from '@material-ui/core/CardContent';
import Avatar from '@material-ui/core/Avatar';

const MyCard = () => (
  <Card>
    <CardHeader avatar={<Avatar>R</Avatar>} title="Owner" subheader="Admin" />
    <CardContent>Hello</CardContent>
  </Card>
);
