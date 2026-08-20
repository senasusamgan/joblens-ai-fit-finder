import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — JobLens AI" },
      {
        name: "description",
        content: "Privacy Policy for JobLens AI.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to JobLens AI
        </Link>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight">
          Privacy Policy
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: August 20, 2026
        </p>

        <div className="mt-10 space-y-8 leading-7 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              1. Overview
            </h2>
            <p className="mt-3">
              JobLens AI helps users evaluate job opportunities, analyze
              application fit, and manage job applications. This Privacy Policy
              explains what information may be processed when you use the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              2. Information you provide
            </h2>
            <p className="mt-3">
              You may provide information such as job descriptions, CV or
              resume content, application details, notes, reminders, and other
              information required to use JobLens AI features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              3. Google account and Gmail access
            </h2>
            <p className="mt-3">
              Google sign-in may be used to authenticate your account. Gmail
              access is optional and requested separately. When you choose to
              scan Gmail, JobLens AI requests read-only access to identify
              recruitment-related signals such as applications, interviews,
              assessments, offers, and rejections.
            </p>
            <p className="mt-3">
              Gmail scanning occurs only when you request it. Email body
              content is not stored in your application tracker. JobLens AI may
              store limited metadata necessary to remember whether a detected
              signal has already been reviewed, such as a Gmail message
              identifier, the action taken, and the associated application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              4. CV and job analysis
            </h2>
            <p className="mt-3">
              CV or resume content and job descriptions may be processed to
              provide AI-assisted analysis. JobLens AI does not intentionally
              store the full CV text in the application tracker.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Application data
            </h2>
            <p className="mt-3">
              Signed-in users may store application information such as company
              name, job title, application stage, match score, notes, and
              reminders so that their tracker can be synchronized across
              devices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              6. Data access and security
            </h2>
            <p className="mt-3">
              JobLens AI is designed so authenticated users can access only
              their own stored application data. Reasonable technical measures
              are used to protect stored information, but no online service can
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              7. Third-party services
            </h2>
            <p className="mt-3">
              JobLens AI relies on third-party infrastructure and authentication
              services, including Google authentication and cloud services, to
              provide certain features. Their own privacy policies may also
              apply when you interact with those services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              8. Changes to this policy
            </h2>
            <p className="mt-3">
              This Privacy Policy may be updated as JobLens AI evolves. The
              latest version will be published on this page.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
