/*
 * Copyright 2025 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { screen } from '@testing-library/react';
import type {
  MockFetchApi,
  MockConfigApi,
} from '@backstage/frontend-test-utils';
import { MyClient } from '../api';

export function createClient(fetchApi: MockFetchApi, configApi: MockConfigApi) {
  return new MyClient({ fetchApi, configApi, screen });
}
