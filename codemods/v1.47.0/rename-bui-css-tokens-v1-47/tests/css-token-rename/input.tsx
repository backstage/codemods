import { styled } from '@mui/material/styles';

const StyledComponent = styled('div')({
  background: 'var(--bui-bg)',
  '&:hover': {
    background: 'var(--bui-bg-tint-hover)',
  },
  '&:active': {
    background: 'var(--bui-bg-tint-pressed)',
  },
  '&:disabled': {
    background: 'var(--bui-bg-tint-disabled)',
  },
  '& .child': {
    background: 'var(--bui-bg-tint)',
  },
});
