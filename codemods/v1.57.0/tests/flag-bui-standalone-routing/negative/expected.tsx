import { BUIProvider, Link } from '@backstage/ui';
import { Link as OtherLink } from 'other';

export const App = () => (
  <BUIProvider>
    <BUIProvider />
    <Link href="/home" />
    <Link href={url} />
    <Link href={`data:${value}`} />
    <Link href={makeHref('javascript:')} />
    <Link href={'javascript:' + value} />
    <OtherLink href="data:test" />
    <a href="javascript:alert(1)">Open</a>
  </BUIProvider>
);

function Shadowed(Link: any) {
  return <Link href="data:test" />;
}
