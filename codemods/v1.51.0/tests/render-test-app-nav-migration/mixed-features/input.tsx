import { renderInTestApp } from '@backstage/frontend-test-utils';
import { navItemExtension } from './navExtension';
import { pageExtension } from './pageExtension';

function MyPage() {
  return null;
}

it('keeps non-nav features', async () => {
  await renderInTestApp(<MyPage />, {
    features: [navItemExtension, pageExtension],
  });
});
