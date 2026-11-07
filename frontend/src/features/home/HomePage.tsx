import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';

export function HomePage() {
  return (
    <PageContainer>
      <PageHeading
        title="Welcome back"
        lede="Start a roadmap from a Jira export, reopen a saved one, or draw a workflow."
      />
    </PageContainer>
  );
}
