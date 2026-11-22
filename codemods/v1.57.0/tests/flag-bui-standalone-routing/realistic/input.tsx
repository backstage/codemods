import { BUIProvider, Link, ButtonLink } from '@backstage/ui';

export const Root = () => (
  <BUIProvider>
    <Link href="javascript:void(0)">Open</Link>
    <ButtonLink href={'VBScript:msgbox(1)'} />
    <Link href={` DATA:text/html,foo`} />
    {open && <Link href="data:text/html,hi">Open</Link>}
    <Tooltip content={<Link href="javascript:void(0)" />} />
  </BUIProvider>
);
