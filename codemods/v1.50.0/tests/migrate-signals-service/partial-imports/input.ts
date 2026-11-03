import {
  SignalService,
  SignalServiceOptions,
  createSignalsExtensionPoint,
} from '@backstage/plugin-signals-node';

export function makeService(opts: SignalServiceOptions): SignalService {
  createSignalsExtensionPoint();
  return {} as SignalService;
}
