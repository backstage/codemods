import { styled } from '@mui/material/styles';

const StyledComponent = styled('div')({
  background: 'var(--bui-bg-surface-0)',
  '&:hover': {
    background: 'var(--bui-bg-neutral-on-surface-0-hover)',
  },
  '&:active': {
    background: 'var(--bui-bg-neutral-on-surface-0-pressed)',
  },
  '&:disabled': {
    background: 'var(--bui-bg-neutral-on-surface-0-disabled)',
  },
  '& .child': {
    background: 'var(--bui-bg-neutral-on-surface-0)',
  },
});
