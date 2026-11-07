import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';

export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeading
        title="Page not found"
        lede={
          <>
            There's nothing at this address.{' '}
            <Link component={RouterLink} to="/">
              Go to Home
            </Link>
          </>
        }
      />
    </PageContainer>
  );
}
