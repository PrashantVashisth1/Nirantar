/**
 * Developer-only page that shows the design tokens (plan §3.1) in one place:
 * colours, type scales in all three languages, badges and a sample card.
 * It is used to check the visual system before building real screens.
 */

const COLOUR_GROUPS: { title: string; colours: { name: string; hex: string; className: string }[] }[] = [
  {
    title: 'Paper & ink',
    colours: [
      { name: 'canvas', hex: '#F7F6F2', className: 'bg-canvas' },
      { name: 'surface', hex: '#FFFFFF', className: 'bg-surface' },
      { name: 'sunken', hex: '#F0EEE8', className: 'bg-sunken' },
      { name: 'line', hex: '#E3E0D7', className: 'bg-line' },
      { name: 'line-strong', hex: '#CBC7BA', className: 'bg-line-strong' },
      { name: 'ink', hex: '#1A2421', className: 'bg-ink' },
      { name: 'ink-2', hex: '#4D5954', className: 'bg-ink-2' },
      { name: 'ink-3', hex: '#6B7570', className: 'bg-ink-3' },
    ],
  },
  {
    title: 'Pine',
    colours: [
      { name: 'pine', hex: '#0F5C4A', className: 'bg-pine' },
      { name: 'pine-hover', hex: '#0B4C3D', className: 'bg-pine-hover' },
      { name: 'pine-pressed', hex: '#083B30', className: 'bg-pine-pressed' },
      { name: 'pine-subtle', hex: '#E6F0EB', className: 'bg-pine-subtle' },
    ],
  },
  {
    title: 'Meaning',
    colours: [
      { name: 'success', hex: '#17694A', className: 'bg-success' },
      { name: 'warning', hex: '#8A5A00', className: 'bg-warning' },
      { name: 'danger', hex: '#A3261B', className: 'bg-danger' },
      { name: 'info', hex: '#2F5482', className: 'bg-info' },
    ],
  },
];

const LANGUAGE_SAMPLES = [
  {
    lang: 'en',
    label: 'English',
    title: 'Your monthly medicines, without the wait.',
    body: 'Every order is checked by a registered pharmacist.',
  },
  {
    lang: 'hi',
    label: 'हिन्दी',
    title: 'आपकी मासिक दवाइयाँ, बिना इंतज़ार के।',
    body: 'हर ऑर्डर एक पंजीकृत फ़ार्मासिस्ट जाँचते हैं।',
  },
  {
    lang: 'bn',
    label: 'বাংলা',
    title: 'আপনার মাসিক ওষুধ, অপেক্ষা ছাড়াই।',
    body: 'প্রতিটি অর্ডার একজন নিবন্ধিত ফার্মাসিস্ট যাচাই করেন।',
  },
];

const STATUS_PILLS = [
  { label: 'Pharmacist is checking', tone: 'bg-info-bg text-info', dot: 'bg-info' },
  { label: 'Your confirmation needed', tone: 'bg-warning-bg text-warning', dot: 'bg-warning' },
  { label: 'Delivered', tone: 'bg-success-bg text-success', dot: 'bg-success' },
  { label: "Couldn't be approved", tone: 'bg-danger-bg text-danger', dot: 'bg-danger' },
  { label: 'Cancelled', tone: 'bg-sunken text-ink-2', dot: 'bg-ink-3' },
];

export function DesignPreviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-12 border-b border-line pb-6">
        <p className="font-serif text-title font-semibold text-pine">Nirantar</p>
        <p className="mt-1 text-body text-ink-2">Design tokens · preview for development</p>
      </header>

      <Section title="Colour">
        <div className="grid gap-8 md:grid-cols-3">
          {COLOUR_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-3 text-caption font-medium text-ink-2">{group.title}</h3>
              <ul className="space-y-2">
                {group.colours.map((colour) => (
                  <li key={colour.name} className="flex items-center gap-3">
                    <span className={`h-9 w-9 rounded-sm border border-line ${colour.className}`} />
                    <span className="text-body">{colour.name}</span>
                    <span className="ml-auto font-mono text-caption text-ink-3">{colour.hex}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Customer type, in all three languages">
        <div className="grid gap-6 md:grid-cols-3">
          {LANGUAGE_SAMPLES.map((sample) => (
            <div key={sample.lang} lang={sample.lang} className="border-t border-line pt-4">
              <p className="mb-2 text-caption font-medium text-ink-3">{sample.label}</p>
              <p className="font-serif text-title font-semibold">{sample.title}</p>
              <p className="mt-2 text-body-lg text-ink-2">{sample.body}</p>
            </div>
          ))}
        </div>
        <dl className="mt-8 divide-y divide-line border-y border-line">
          {[
            ['display · 30 serif', 'font-serif text-display font-semibold', 'Your pharmacist is checking'],
            ['title · 26 serif', 'font-serif text-title font-semibold', 'Good evening, Debasish'],
            ['heading · 21', 'text-heading font-semibold', 'For Maa · Anjali Ghosh'],
            ['body-lg · 18', 'text-body-lg', 'Metformin 500 mg · 4 strips · runs out around Fri 13 Nov'],
            ['body · 16', 'text-body text-ink-2', 'Usually within 10 minutes between 8 am and 10 pm.'],
            ['caption · 14', 'text-caption font-medium text-ink-3', 'DUE SOON'],
          ].map(([name, className, text]) => (
            <div key={name} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:items-baseline">
              <dt className="font-mono text-caption text-ink-3">{name}</dt>
              <dd className={className}>{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Staff type (workbench)">
        <dl className="divide-y divide-line border-y border-line">
          {[
            ['staff-title · 22', 'text-staff-title font-semibold', 'Verification queue'],
            ['staff-section · 17', 'text-staff-section font-semibold', 'Prescription details'],
            ['staff-body · 15', 'text-staff-body', 'Telmisartan 40 mg tablet · strip of 10 · ₹285'],
            ['staff-table · 14', 'text-staff-table tabular-nums', 'RX-50214   Rina Sen · 58   7 min'],
            ['staff-caption · 13', 'text-staff-caption font-medium text-ink-2', 'WAITING'],
          ].map(([name, className, text]) => (
            <div key={name} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:items-baseline">
              <dt className="font-mono text-caption text-ink-3">{name}</dt>
              <dd className={className}>{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xs border border-line-strong px-1.5 py-0.5 text-staff-caption font-semibold text-ink-2">
            OTC
          </span>
          <span className="rounded-xs border border-ink px-1.5 py-0.5 text-staff-caption font-semibold text-ink">
            H · Rx
          </span>
          <span className="rounded-xs bg-ink px-1.5 py-0.5 text-staff-caption font-semibold text-white">
            H1
          </span>
          <span className="rounded-xs bg-danger px-1.5 py-0.5 text-staff-caption font-semibold text-white">
            X · Not sold online
          </span>
          <span className="border-l-2 border-warning bg-warning-bg px-2 py-0.5 text-staff-caption font-medium text-warning">
            AI unsure
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {STATUS_PILLS.map((pill) => (
            <span
              key={pill.label}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-caption font-medium ${pill.tone}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
              {pill.label}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Sample: the one raised card on Home">
        <div className="max-w-[400px] rounded-md bg-surface p-5 shadow-raised">
          <p className="text-caption font-medium text-ink-3">FOR MAA · ANJALI GHOSH</p>
          <p className="mt-2 text-heading font-semibold">Metformin 500 mg</p>
          <p className="text-body text-ink-2">Glycora 500 · 4 strips</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className="h-full w-1/6 rounded-full bg-pine" />
          </div>
          <p className="mt-2 text-body text-ink-2">
            <span className="font-semibold text-ink">5 days left</span> · runs out around Fri, 13 Nov
          </p>
          <div className="mt-5 flex h-14 w-full items-center justify-center rounded-md bg-pine text-body-lg font-medium text-white">
            Reorder
          </div>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="mb-5 text-heading font-semibold">{title}</h2>
      {children}
    </section>
  );
}
