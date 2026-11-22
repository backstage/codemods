import { BUIProvider, Link, ButtonLink } from '@backstage/ui';

export const Root = () => (
  <BUIProvider>
    {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}
    <Link href="javascript:void(0)">Open</Link>
    {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}
    <ButtonLink href={'VBScript:msgbox(1)'} />
    {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}
    <Link href={` DATA:text/html,foo`} />
    {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}
    {open && <Link href="data:text/html,hi">Open</Link>}
    {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}
    <Tooltip content={<Link href="javascript:void(0)" />} />
  </BUIProvider>
);
