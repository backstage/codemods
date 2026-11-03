import type {
  SignalsService,
  SignalsServiceOptions,
} from '@backstage/plugin-signals-node';

export type ServiceFactory = (opts: SignalsServiceOptions) => Promise<SignalsService>;
