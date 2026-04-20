import { AppShell } from '@/components/layout/app-shell';
import { NewNoteForm } from '@/components/note/new-note-form';

export default function NewNotePage() {
  return (
    <AppShell
      title="New Note Workspace"
      subtitle="Build one patient note inside a calmer, modern workspace: compose the source, generate a draft, and finish review without the workflow feeling fragmented."
    >
      <NewNoteForm />
    </AppShell>
  );
}
