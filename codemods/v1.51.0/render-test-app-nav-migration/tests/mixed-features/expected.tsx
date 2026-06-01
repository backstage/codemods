import { navItemExtension } from './navExtension';
import { pageExtension } from './pageExtension';
import { renderTestApp } from '@backstage/frontend-test-utils';

function MyPage() {
  return null;
}

it('keeps non-nav features', async () => {
  await renderTestApp(<MyPage />, { features: [pageExtension] });
});
