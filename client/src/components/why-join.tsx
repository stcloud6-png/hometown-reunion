import { CalendarCheck, BookOpen, Ticket, Users } from "lucide-react";

// Plain-language reasons to sign up, shown under the entry form. The full
// version (with FAQ and structured data for search engines) is the static
// page at /about (client/public/about/index.html); keep the two in step.
const REASONS = [
  {
    icon: CalendarCheck,
    title: "Your week, planned in minutes",
    body: "Your dates, the Yacht Club '87 Dinner/Dance and the CZR events you're going to, all on one calendar.",
  },
  {
    icon: Users,
    title: "See who's in town",
    body: "Which classmates are in Panama on which days, and the best times for the group to meet.",
  },
  {
    icon: Ticket,
    title: "Outings and tickets",
    body: "Join interest groups with classmates who want the same things, and see which events are selling out.",
  },
  {
    icon: BookOpen,
    title: "The '87 yearbook",
    body: "Flip through it online, search by today's name, and add a current photo if you had no portrait.",
  },
];

export default function WhyJoin() {
  return (
    <section aria-labelledby="why-join-heading" className="mx-auto mt-12 max-w-4xl border-t pt-8" data-testid="section-why-join">
      <h2 id="why-join-heading" className="text-center font-serif text-2xl font-semibold">
        Why sign up?
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-center text-sm text-muted-foreground">
        Free for the Balboa High School Class of 1987. Every entry helps the whole class find the best times to get together.
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-lg border bg-card p-4">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-sm">
        <a href="/about" className="font-medium text-primary underline underline-offset-2" data-testid="link-why-join-more">
          More about bhs87.com and common questions
        </a>
      </p>
    </section>
  );
}
