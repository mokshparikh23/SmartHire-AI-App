import Link from 'next/link'
import Icon, { Logo } from '@/components/ui/Icon'

export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="inline-flex items-center gap-2.5 self-start">
          <Logo size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-ink">Smart Hire AI</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-[12px] text-faint">
          © {new Date().getFullYear()} Smart Hire AI
        </p>
      </div>

      {/* Editorial side. Hidden on small screens rather than squashed. */}
      <div className="relative hidden flex-col justify-between bg-ink px-12 py-12 lg:flex">
        <p className="eyebrow text-paper/40">Smart Hire AI</p>

        {/*
          PIVOT 2026-08-29: the quote below was the candidate-side pitch, and it
          was attributed to "the people who do" — a testimonial with no source.
          Replaced with a statement of what the product is, which needs no
          attribution because it is not a claim about anyone's experience.

          <blockquote className="display text-[2.25rem] leading-[1.15] text-paper">
            “It answered the question
            <span className="display-italic"> before I had finished </span>
            processing it myself.”
          </blockquote>
          <p className="mt-6 text-[14px] text-paper/50">
            What using it feels like, according to the people who do.
          </p>
        */}
        <div className="max-w-md">
          <p className="display text-[2.25rem] leading-[1.15] text-paper">
            The best follow-up is the one
            <span className="display-italic"> you think of in the room</span>, not
            in the write-up afterwards.
          </p>
          <p className="mt-6 text-[14px] text-paper/50">
            That is the whole product.
          </p>
        </div>

        <ul className="space-y-3.5 border-t border-paper/10 pt-8">
          {[
            // PIVOT 2026-08-29: was
            //   ['eye',  'Hidden from screen sharing and recordings'],
            //   ['file', 'Answers grounded in your own résumé'],
            // Both described the covert candidate-side tool.
            ['shield', 'Résumé used only once the candidate agrees'],
            // CORRECTION 2026-08-30: "and the research" removed — there is no
            // company research feature; the desktop app never calls the route.
            // ['file', 'Follow-ups grounded in the résumé and the research'],
            ['file',   'Follow-ups grounded in the résumé and the job description'],
            ['lock',   'No API key to set up or pay for'],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-center gap-3 text-[14px] text-paper/70">
              <Icon name={icon} size={16} className="shrink-0 text-paper/40" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
