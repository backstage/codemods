
import CardMedia from '@material-ui/core/CardMedia';
import { Card, CardBody } from '@backstage/ui';


const MyCard = () => (
  <Card><>
  {/* TODO(backstage-codemod): CardMedia has no BUI equivalent — migrate manually */}
  <CardMedia image="/cover.png" title="Cover" />
</><CardBody>Hello</CardBody></Card>
);
