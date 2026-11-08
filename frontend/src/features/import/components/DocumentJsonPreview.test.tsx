import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PREVIEW } from '../../../test/importFixtures';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { DocumentJsonPreview } from './DocumentJsonPreview';

function renderPreview(document: typeof PREVIEW.document | undefined) {
  render(<DocumentJsonPreview document={document} />, {
    wrapper: providersFor(createTestQueryClient()),
  });
}

describe('DocumentJsonPreview', () => {
  it('IMP-11 abbreviates items and PIs', () => {
    renderPreview(PREVIEW.document);

    const json = screen.getByLabelText('Roadmap JSON').textContent;
    expect([json.includes('"items": [ … 12 epics ]'), json.includes('"pis": [ … 3 PIs ]')]).toEqual(
      [true, true],
    );
  });

  it('IMP-11 captions the schema version', () => {
    renderPreview(PREVIEW.document);

    expect(screen.getByText('roadmap JSON · schema v1')).toBeVisible();
  });

  it('IMP-11 shows a skeleton until the first preview', () => {
    renderPreview(undefined);

    expect(screen.getByLabelText('Loading the document')).toBeInTheDocument();
  });
});
