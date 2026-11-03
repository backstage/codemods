import {
  type SignalService,
  type SignalServiceOptions,
  DefaultSignalService,
} from '@backstage/plugin-signals-node';

export function makeService(opts: SignalServiceOptions): SignalService {
  return DefaultSignalService.create(opts);
}
