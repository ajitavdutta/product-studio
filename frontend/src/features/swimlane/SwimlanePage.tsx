import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useAutosave } from '../../api/useAutosave';
import { useDiagram, type DiagramRead } from '../../api/useDiagram';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';

const NOT_FOUND_STATUS = 404;
const NAME_MAX_LENGTH = 200;
const NAME_FIELD_MAX_WIDTH = 480;

export function SwimlanePage() {
  // The route always supplies :id; an empty id simply 404s.
  const { id = '' } = useParams();
  const diagram = useDiagram(id);

  if (diagram.isPending) {
    return (
      <PageContainer>
        <Box aria-busy="true" aria-label="Loading the diagram">
          <Skeleton variant="text" width="40%" height={40} />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rounded" height={56} sx={{ mt: 2, maxWidth: NAME_FIELD_MAX_WIDTH }} />
        </Box>
      </PageContainer>
    );
  }

  if (diagram.isError) {
    if (diagram.error instanceof ApiError && diagram.error.status === NOT_FOUND_STATUS) {
      return (
        <PageContainer>
          <PageHeading
            title="We couldn't find that diagram."
            lede="It may have been deleted."
          />
          <Box>
            <Button variant="contained" component={RouterLink} to="/">
              Go home
            </Button>
          </Box>
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void diagram.refetch()}>
              Retry
            </Button>
          }
        >
          Couldn't load the diagram.
        </Alert>
      </PageContainer>
    );
  }

  return <DiagramPlaceholder diagram={diagram.data} />;
}

/** ASSUMPTION: a stand-in until the M4 editor; its name field exercises autosave (G-2). */
function DiagramPlaceholder({ diagram }: { diagram: DiagramRead }) {
  const autosave = useAutosave('diagram', diagram.id);
  const [nameMissing, setNameMissing] = useState(false);

  return (
    <PageContainer>
      <PageHeading
        title={diagram.document.name}
        lede="The diagram editor arrives in a later milestone."
      />
      <TextField
        // Uncontrolled so typing never fights the cache; remount when the server's copy replaces ours.
        key={autosave.reloads}
        label="Diagram name"
        defaultValue={diagram.document.name}
        error={nameMissing}
        helperText={nameMissing ? 'Enter a name' : undefined}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
        onChange={(event) => {
          const value = event.target.value;
          const isBlank = value.trim() === '';
          setNameMissing(isBlank);
          if (!isBlank) autosave.save([{ op: 'set', path: '/name', value }], 'text');
        }}
        sx={{ maxWidth: NAME_FIELD_MAX_WIDTH }}
      />
    </PageContainer>
  );
}
