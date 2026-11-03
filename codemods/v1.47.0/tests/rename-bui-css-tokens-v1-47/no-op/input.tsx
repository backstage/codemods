import { styled } from '@mui/material/styles';

const StyledComponent = styled('div')({
  background: 'var(--bui-bg-surface-0)',
  color: 'var(--bui-text-primary)',
  border: '1px solid var(--bui-border-default)',
  '& .child': {
    background: 'var(--bui-bg-neutral-on-surface-0)',
  },
});
