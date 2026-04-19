import * as signals from '@backstage/plugin-signals-node';

export function makeService(opts: signals.SignalServiceOptions): signals.SignalService {
  return signals.DefaultSignalService.create(opts);
}
