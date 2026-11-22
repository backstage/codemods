import { Link } from '@backstage/ui';

export const Root = () => (
  // TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead.
  <Link href="javascript:void(0)">Open</Link>
);

function App() {
  if (ok) { log('🎉ü');
    // TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead.
    return <Link href="data:text/html,hi" />; }
  return null;
}
