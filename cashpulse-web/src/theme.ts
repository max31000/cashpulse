import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, sans-serif',
  components: {
    Paper: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
