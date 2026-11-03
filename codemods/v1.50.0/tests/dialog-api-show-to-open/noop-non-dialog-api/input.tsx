import { SomeOtherApi } from 'some-other-package';

function doStuff(api: SomeOtherApi) {
  api.show({ content: 'hello' });
  api.showModal({ content: 'world' });
}
