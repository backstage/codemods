import {
  SignalService as SignalSvc,
  DefaultSignalService as DefaultSvc,
  signalService as serviceRef,
  SignalServiceOptions as ServiceOptions,
} from '@backstage/plugin-signals-node';

const opts: ServiceOptions = { events };
const svc: SignalSvc = DefaultSvc.create(opts);
const ref = serviceRef;
