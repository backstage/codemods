import type {
  SignalService,
  SignalServiceOptions,
} from '@backstage/plugin-signals-node';

export type ServiceFactory = (opts: SignalServiceOptions) => Promise<SignalService>;
