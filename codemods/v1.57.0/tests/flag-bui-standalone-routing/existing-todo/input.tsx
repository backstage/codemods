import { BUIProvider, Link } from '@backstage/ui';
export const Root = () => (
  <BUIProvider>
    {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}
    <Link href="javascript:alert(1)" />
  </BUIProvider>
);
export const Other = () => (
  // TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead.
  <Link href="data:text/html,hi" />
);
function App() {
  if (ok) { log('🎉ü');
    // TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead.
    return <Link href="data:text/html,hi" />; }
  return null;
}
