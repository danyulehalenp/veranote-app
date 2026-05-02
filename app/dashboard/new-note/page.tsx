import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { NewNoteForm } from '@/components/note/new-note-form';

export default function NewNotePage() {
  return (
    <AppShell
      title="New Note Workspace"
      subtitle="Choose a note type, paste your rough source, and generate a draft to review."
      hidePageHeader
      fullWidth
      showFeedback={false}
    >
      <Suspense fallback={null}>
        <NewNoteForm />
      </Suspense>
    </AppShell>
  );
}
