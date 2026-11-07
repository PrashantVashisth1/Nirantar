import { X } from 'lucide-react';
import { useState } from 'react';
import { Banner } from '../design-system/Banner';
import { useMe } from '../lib/session';

const dismissedKey = (userId: string) => `nirantar.demoGuide.dismissed.${userId}`;

function wasDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(dismissedKey(userId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Test mode only: who you're signed in as, what this person does and what to try.
 * The server sends it only in test mode. Written for reviewers, so it's in English.
 */
export function DemoGuide({ className }: { className?: string }) {
  const { data: me } = useMe();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const guide = me?.demoGuide;
  if (!me || !guide || dismissed === me.id || wasDismissed(me.id)) return null;

  return (
    <div lang="en" className={className}>
      <Banner
        tone="info"
        title={`You're signed in as ${guide.name}`}
        action={
          <button
            type="button"
            aria-label="Hide this guide"
            className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface"
            onClick={() => {
              try {
                sessionStorage.setItem(dismissedKey(me.id), '1');
              } catch {
                // Hidden until the next reload instead; nothing else depends on it.
              }
              setDismissed(me.id);
            }}
          >
            <X className="size-4" aria-hidden />
          </button>
        }
      >
        <span className="block">{guide.job}</span>
        <span className="mt-1 block">
          <strong className="font-semibold">Try this:</strong> {guide.tryThis}
        </span>
        <span className="mt-1 block text-ink-2">Sign out to continue as someone else.</span>
      </Banner>
    </div>
  );
}
