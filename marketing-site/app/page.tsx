const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.veranote.ai';

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="marketing-vera" x1="3" y1="2" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B9FBFF" />
          <stop offset="48%" stopColor="#2FD5F3" />
          <stop offset="100%" stopColor="#62F0C7" />
        </linearGradient>
      </defs>
      <path d="M4 5.5C4 4.12 5.12 3 6.5 3H17.7C18.65 3 19.56 3.38 20.23 4.05L23.95 7.77C24.62 8.44 25 9.35 25 10.3V21.5C25 22.88 23.88 24 22.5 24H6.5C5.12 24 4 22.88 4 21.5V5.5Z" stroke="url(#marketing-vera)" strokeWidth="1.8" />
      <path d="M17.8 3L25 10.2H19.7C18.65 10.2 17.8 9.35 17.8 8.3V3Z" fill="url(#marketing-vera)" />
      <path d="M8.7 14.2L12.3 17.8L19.6 10.4" stroke="url(#marketing-vera)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <div className="brand-mark">
              <LogoMark />
            </div>
            <div className="brand-copy">
              <strong>Veranote</strong>
              <span>Clinical Note Intelligence Workspace</span>
            </div>
          </div>
          <div className="nav-links">
            <a className="pill-link" href="#workflow">Workflow</a>
            <a className="pill-link" href="#ehr">EHR fit</a>
            <a className="primary-link" href={`${appUrl}/sign-in`}>Provider sign in</a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-panel">
            <div className="eyebrow">Source-first clinical note intelligence</div>
            <h1>Write faster without breaking trust.</h1>
            <p className="lead">
              Veranote helps providers turn messy clinical input into source-faithful notes, structured review, and EHR-ready paste paths without pretending the clinician is out of the loop.
            </p>
            <div className="hero-actions">
              <a className="primary-link" href={`${appUrl}/sign-in`}>Open the provider app</a>
              <a className="pill-link" href="#workflow">See the workflow</a>
            </div>

            <div className="hero-grid">
              <div className="card">
                <div className="eyebrow">Source first</div>
                <strong>Capture stays visible</strong>
                <p>The provider can compare source, draft, review, and finish in one continuous workspace.</p>
              </div>
              <div className="card">
                <div className="eyebrow">Review aware</div>
                <strong>Warnings stay close</strong>
                <p>Veranote keeps evidence, risk cues, and wording review near the note instead of hiding them in another screen.</p>
              </div>
              <div className="card">
                <div className="eyebrow">EHR practical</div>
                <strong>Paste paths are explicit</strong>
                <p>Providers can copy whole-note or field-by-field depending on the destination and local workflow.</p>
              </div>
            </div>

            <div className="stat-grid">
              <div className="card">
                <div className="eyebrow">For providers</div>
                <span className="value">1 workspace</span>
                <p>No jumping between disconnected compose and review pages.</p>
              </div>
              <div className="card">
                <div className="eyebrow">For trust</div>
                <span className="value">Review-first</span>
                <p>Finish only clears when the note has been explicitly reviewed.</p>
              </div>
              <div className="card">
                <div className="eyebrow">For fit</div>
                <span className="value">Psych-aware</span>
                <p>Built for psych workflows, medication nuance, and source fidelity.</p>
              </div>
              <div className="card">
                <div className="eyebrow">For rollout</div>
                <span className="value">Beta ready</span>
                <p>Separate provider app, public site, and domain-aware auth setup.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="workflow">
          <div className="section-header">
            <div className="eyebrow">Workflow</div>
            <h2>One continuous clinical session from source to finish.</h2>
            <p>
              Veranote is designed so the provider can move from intake and rough notes into draft generation, review, and EHR paste without losing context or having to rebuild decisions.
            </p>
          </div>
          <div className="section-grid">
            <div className="section-card">
              <strong>1. Capture source</strong>
              <p>Paste clinician notes, intake collateral, transcripts, and objective data into a source-first workspace that keeps the raw input visible.</p>
            </div>
            <div className="section-card">
              <strong>2. Generate with context</strong>
              <p>Drafting respects note lane, destination behavior, and provider preferences instead of acting like every session starts from zero.</p>
            </div>
            <div className="section-card">
              <strong>3. Review before finish</strong>
              <p>Providers land in the first unresolved section, see why it matters, and clear review before copying anything into the chart.</p>
            </div>
          </div>
        </section>

        <section className="section" id="ehr">
          <div className="section-header">
            <div className="eyebrow">EHR fit</div>
            <h2>Built for the last mile into real clinical systems.</h2>
            <p>
              Different workflows need different paste behavior. Veranote supports whole-note paste, field-target copy, and destination-aware cleanup so the final step feels practical instead of fragile.
            </p>
          </div>
          <div className="split">
            <div className="section-card">
              <strong>Destination-aware output</strong>
              <ul className="feature-list">
                <li>Whole-note copy for flatter or stricter templates.</li>
                <li>Field-by-field copy targets for sectioned EHR workflows.</li>
                <li>Paste-path guidance so providers know what to copy first, second, and last.</li>
                <li>Destination profiles for systems like WellSky, Tebra/Kareo, TherapyNotes, and more.</li>
              </ul>
            </div>
            <div className="section-card">
              <strong>What providers keep</strong>
              <ul className="step-list">
                <li>Source visibility while drafting and reviewing.</li>
                <li>Explicit review state before finish.</li>
                <li>Provider memory and workflow continuity through Vera.</li>
                <li>Cleaner transitions between note creation and EHR entry.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div>
            <div className="eyebrow">Provider beta</div>
            <h2 style={{ margin: '10px 0 0', fontSize: 'clamp(1.8rem, 2.8vw, 2.5rem)', letterSpacing: '-0.05em' }}>
              Ready to open the provider workspace?
            </h2>
            <p style={{ margin: '12px 0 0', color: 'var(--muted)', lineHeight: 1.8 }}>
              The app lives separately at <strong>app.veranote.ai</strong> so the provider workflow stays isolated from the public site.
            </p>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            <a className="primary-link" href={`${appUrl}/sign-in`}>Go to app.veranote.ai</a>
          </div>
        </section>
      </main>

      <footer className="footer">
        Veranote is building a sharper provider workflow for source-faithful documentation, review, and EHR-ready output.
      </footer>
    </>
  );
}
