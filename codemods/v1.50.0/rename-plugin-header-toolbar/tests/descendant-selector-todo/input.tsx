import { styled } from '@mui/material/styles';

const StyledContainer = styled('div')({
  '& .bui-PluginHeaderToolbarWrapper > button': {
    color: 'red',
  },
  '& .bui-PluginHeaderToolbarWrapper .icon': {
    fontSize: '16px',
  },
});
