import { styled } from '@mui/material/styles';

const StyledContainer = styled('div')({
  /* TODO(backstage-codemod): Header root class removed — review selector intent */
  '& .bui-HeaderContent > .title': {
    fontWeight: 'bold',
  },
  /* TODO(backstage-codemod): Header root class removed — review selector intent */
  '& .bui-HeaderContent .icon': {
    fontSize: '16px',
  },
});
