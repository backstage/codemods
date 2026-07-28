
import CardHeader from '@material-ui/core/CardHeader';

import Avatar from '@material-ui/core/Avatar';
import { Card, CardBody } from '@backstage/ui';

const MyCard = () => (
  <Card><>
  {/* TODO(backstage-codemod): verify complex CardHeader migration manually (avatar/action/subheader) */}
  <CardHeader avatar={<Avatar>R</Avatar>} title="Owner" subheader="Admin" />
</><CardBody>Hello</CardBody></Card>
);
