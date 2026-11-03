import {
  SignalsService,
  SignalsServiceOptions,
  createSignalsExtensionPoint,
} from '@backstage/plugin-signals-node';

export function makeService(opts: SignalsServiceOptions): SignalsService {
  createSignalsExtensionPoint();
  return {} as SignalsService;
}
