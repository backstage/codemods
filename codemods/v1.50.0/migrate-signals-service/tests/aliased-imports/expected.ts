import {
  SignalsService as SignalSvc,
  DefaultSignalsService as DefaultSvc,
  signalsServiceRef as serviceRef,
  SignalsServiceOptions as ServiceOptions,
} from '@backstage/plugin-signals-node';

const opts: ServiceOptions = { events };
const svc: SignalSvc = DefaultSvc.create(opts);
const ref = serviceRef;
