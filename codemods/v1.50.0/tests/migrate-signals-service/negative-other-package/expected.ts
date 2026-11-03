import {
  SignalService,
  DefaultSignalService,
  signalService,
  SignalServiceOptions,
} from './local-signals';

const opts: SignalServiceOptions = { events };
const svc: SignalService = DefaultSignalService.create(opts);
const ref = signalService;
