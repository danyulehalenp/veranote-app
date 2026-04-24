import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { NewNoteForm } from '@/components/note/new-note-form';

export default function HomePage() {
  return (
    <AppShell title="Workspace" hidePageHeader fullWidth showFeedback={false}>
      <div id="workspace">
        <Suspense fallback={null}>
          <NewNoteForm />
        </Suspense>
      </div>
    </AppShell>
  );
}
