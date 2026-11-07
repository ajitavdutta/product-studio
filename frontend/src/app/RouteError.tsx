import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router';
import { PageContainer } from '../components/PageContainer';
import { Wordmark } from '../components/Wordmark';

/** The router's errorElement: a minimal page that still lets the user recover. */
export function RouteError() {
  return (
    <>
      <Box
        component="header"
        sx={(theme) => ({
          minHeight: theme.custom.layout.appBarHeight,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
        })}
      >
        <Wordmark />
      </Box>
      <Box component="main">
        <PageContainer>
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Reload
              </Button>
            }
          >
            Something went wrong on this page.
          </Alert>
          <Link component={RouterLink} to="/">
            Go home
          </Link>
        </PageContainer>
      </Box>
    </>
  );
}
