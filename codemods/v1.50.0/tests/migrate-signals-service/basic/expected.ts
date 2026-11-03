import {
  SignalsService,
  DefaultSignalsService,
  signalsServiceRef,
  SignalsServiceOptions,
} from '@backstage/plugin-signals-node';

const opts: SignalsServiceOptions = { events };
const svc: SignalsService = DefaultSignalsService.create(opts);
const ref = signalsServiceRef;
