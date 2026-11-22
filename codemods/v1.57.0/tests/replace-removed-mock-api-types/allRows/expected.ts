import type {
  mockApis,
} from '@backstage/frontend-test-utils';

type AllMocks = [
  ReturnType<typeof mockApis.alert>,
  ReturnType<typeof mockApis.analytics>,
  ReturnType<typeof mockApis.config>,
  ReturnType<typeof mockApis.error>,
  ReturnType<typeof mockApis.featureFlags>,
  ReturnType<typeof mockApis.fetch>,
  ReturnType<typeof mockApis.permission>,
  ReturnType<typeof mockApis.storage>,
  ReturnType<typeof mockApis.translation>,
  NonNullable<Parameters<typeof mockApis.error>[0]>,
  NonNullable<Parameters<typeof mockApis.fetch>[0]>,
  NonNullable<Parameters<typeof mockApis.featureFlags>[0]>,
  ReturnType<ReturnType<typeof mockApis.error>['getErrors']>[number],
];
