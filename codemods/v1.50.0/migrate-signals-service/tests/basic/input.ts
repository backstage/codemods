import {
  SignalService,
  DefaultSignalService,
  signalService,
  SignalServiceOptions,
} from '@backstage/plugin-signals-node';

const opts: SignalServiceOptions = { events };
const svc: SignalService = DefaultSignalService.create(opts);
const ref = signalService;
