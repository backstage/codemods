import {
  type SignalsService,
  type SignalsServiceOptions,
  DefaultSignalsService,
} from '@backstage/plugin-signals-node';

export function makeService(opts: SignalsServiceOptions): SignalsService {
  return DefaultSignalsService.create(opts);
}
