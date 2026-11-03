import { NavItemBlueprint } from '@backstage/frontend-plugin-api';
import { myNavFeature } from './navFeature';
import { pageExtension } from './pageExtension';
import { renderTestApp } from '@backstage/frontend-test-utils';

function MyPage() {
  return null;
}

it('keeps non-nav features when NavItemBlueprint is imported', async () => {
  void NavItemBlueprint;
  await renderTestApp(<MyPage />, { features: [pageExtension] });
});
