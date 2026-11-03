import { SelectProps } from '@backstage/ui';

interface WithAnalytics {
  trackingId: string;
}

type MySelectProps = SelectProps & WithAnalytics & {
  customFilter: boolean;
};
