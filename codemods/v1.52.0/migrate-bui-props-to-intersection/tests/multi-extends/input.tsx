import { SelectProps } from '@backstage/ui';

interface WithAnalytics {
  trackingId: string;
}

interface MySelectProps extends SelectProps, WithAnalytics {
  customFilter: boolean;
}
