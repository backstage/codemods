/*
 * Copyright 2025 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { screen } from '@testing-library/react';
import type {
  mockApis,
} from '@backstage/frontend-test-utils';
import { MyClient } from '../api';

export function createClient(fetchApi: ReturnType<typeof mockApis.fetch>, configApi: ReturnType<typeof mockApis.config>) {
  return new MyClient({ fetchApi, configApi, screen });
}
