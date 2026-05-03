import { AppShell } from '@/components/layout/app-shell';
import { SavedDraftsList } from '@/components/note/saved-drafts-list';

export default function DraftsPage() {
  return (
    <AppShell
      title="Saved Drafts"
      subtitle="Recover unfinished notes fast and reopen the right checkpoint in the main workspace path."
      fullWidth
    >
      <SavedDraftsList />
    </AppShell>
  );
}
