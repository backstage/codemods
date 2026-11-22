import { Link } from '@backstage/ui';
const x = (
  <p>
    Größe 🎉 Click {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}<Link href="javascript:void(0)">here</Link> — ok
    Already {/* TODO(backstage-codemod): since 1.57 javascript:/data:/vbscript: hrefs render as inert about:blank links. Use an onClick handler or a blob URL instead. */}<Link href="javascript:void(0)">done</Link> too
  </p>
);
