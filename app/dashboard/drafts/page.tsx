import { AppShell } from '@/components/layout/app-shell';
import { SavedDraftsList } from '@/components/note/saved-drafts-list';

export default function DraftsPage() {
  return (
    <AppShell
      title="Saved Drafts"
      subtitle="Browse recent drafts and reopen one for review or further editing."
    >
      <SavedDraftsList />
    </AppShell>
  );
}
