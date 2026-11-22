import { Link } from '@backstage/ui';

export const Root = () => (
  <Link href="javascript:void(0)">Open</Link>
);

function App() {
  if (ok) { log('🎉ü'); return <Link href="data:text/html,hi" />; }
  return null;
}
