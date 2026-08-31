import Icon from 'smarthire-ui/Icon'
import { Container, Button, Badge } from 'smarthire-ui'
import Reveal from '@/components/Reveal'
import SectionMark from '@/components/SectionMark'
import DesiMode from '@/components/DesiMode'
import { PlatformMark, PlatformMarkDefs } from '@/components/PlatformMarks'
import CloseCard from '@/components/CloseCard'
import { FEATURES } from '@/content/features'
import { MEETING_PLATFORMS } from '@/content/platforms'
import { LIMITS } from '@/content/limits'
import { SIGNUP } from '@/lib/app-links'

/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: sections 03 (Features), 04 (Desi Mode), 05 (Works with) and
  07 (What it does not do) of the old apps/web/app/page.jsx.

  LIMITS is here rather than on /how-it-works because FEATURES and LIMITS are the
  same rhetorical device — a capability inventory, positive and negative — and
  the reader weighing whether to buy is on this page. Grounding went the other
  way: it is a claim about mechanism, same register as the steps and the rail.

  Section numbers restart at 01. See the note on SectionMark.

  DESI-MODE 2026-08-30, on backgrounds: the note that stood here reasoned about
  "nine sections and two grounds, so one repeat is unavoidable" and chose to
  spend it between Features and Desi Mode. That arithmetic is gone with the nine
  sections — each page alternates from its own hero now, and this one runs
  paper / canvas / paper / canvas with no repeat at all.
*/

export const metadata = {
  title: 'Features',
  description:
    'What it does in a live interview: hears the question, answers from your CV with ' +
    '[resume] and [JD] tags inline, reads a shared screen, and Desi Mode for plain ' +
    'English — plus the short list of what it will not do.',
  alternates: { canonical: '/features' },
  openGraph: {
    title: 'Features — Smart Hire AI',
    description:
      'Everything it does in a live interview, and the short list of what it does not.',
    url: '/features',
  },
}

export default function FeaturesPage() {
  return (
    <>
      {/* ═══════════════════════════════════════════════ hero ═════════ */}
      <section className="border-b border-line-soft">
        <Container wide className="py-16 sm:py-24">
          <div className="max-w-3xl">
            <Badge tone="accent" className="mb-7">
              <Icon name="sparkle" size={12} />
              Features
            </Badge>

            <h1 className="hl text-[clamp(2rem,4.2vw,3.2rem)] text-ink">
              Everything it does, and the list of what it does not.
            </h1>

            <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-muted">
              Six things it does while a question is being asked, one switch for the
              register it answers in, and the meeting tools it sits above. Then the six
              things it will not do — worth knowing before you pay for it rather than
              after.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button href={SIGNUP} size="lg" iconRight="arrowRight">Get started</Button>
              <Button href="/how-it-works" variant="secondary" size="lg">See how it works</Button>
            </div>
          </div>
        </Container>
      </section>

      {/* ═════════════════════════════════════════ 01 features ════════ */}
      <Reveal as="section" id="features" className="scroll-mt-24 border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          {/* PIVOT 2026-08-29: the title was "Built for the moment you are put
              on the spot." — written for the candidate under pressure.
              CONCEPT 2026-08-30: that reader is back, so the original title is
              back with them. */}
          <SectionMark
            no="01"
            label="In the room"
            title="Built for the moment you are put on the spot."
            lede="Three seconds to read it, and then you have to be talking. Everything below is shaped by that."
          />

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.id}
                className="stagger rounded-2xl border border-line bg-paper p-7 transition-all duration-300 hover:-translate-y-[3px] hover:border-line"
                style={{ '--i': i }}
              >
                <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-canvas-2 text-ink">
                  <Icon name={f.icon} size={18} />
                </span>
                <h3 className="text-[16px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Reveal>

      {/* ════════════════════════════════════════ 02 desi mode ════════ */}
      {/*
        DESI-MODE 2026-08-30: the register switch.

        Framed as REGISTER and nothing else — plain, direct English instead of
        textbook formality. Not "sounds human, not AI" and not "undetectable".
        That holds after the 2026-08-30 concept change and is if anything the
        more important for it: with the reader in the candidate's chair, "make
        it sound less like AI" is the obvious next request, and it is the one
        thing this card must never become. styleBlock() refuses it outright, and
        a section that promised it would be selling software that does not exist.

        Every claim on the card is checkable against
        apps/desktop/src/services/systemPrompt.js — the three tab categories are
        the WHAT TO RETURN and ACCURACY rules of answerPrompt(), and the four
        marks along the bottom restate boundaries the prompt already enforces.
        The one genuinely new thing is Desi Mode itself, and it shipped in the
        same change as this section. Do not let that come apart: the mistake was
        made on 2026-08-29 and it is recorded at the top of app/layout.js and at
        the top of systemPrompt.js.
      */}
      <Reveal as="section" id="desi" className="scroll-mt-24 border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container wide>
          {/* title was "Ask it in the English you actually speak." */}
          <SectionMark
            no="02"
            label="Desi Mode"
            title="Answer in the English you actually speak."
            lede="Switch Desi Mode on and the answer comes back plain and direct instead of textbook-formal. Same substance underneath — you just do not have to rewrite it in your head before you say it."
          />

          <div className="mt-16">
            <DesiMode />
          </div>
        </Container>
      </Reveal>

      {/* ════════════════════════════════════════ 03 platforms ════════ */}
      <Reveal as="section" id="platforms" className="scroll-mt-24 border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          {/* lede was: "It sits above the window rather than inside it, so the
              meeting tool does not matter. These are the ones we check each
              release." — see the LOGOS note in content/platforms.js. */}
          <SectionMark
            no="03"
            label="Works with"
            title="Whatever the interview is running on."
            lede="It sits above the window rather than inside it, so it does not matter whether the interview is a call, a shared editor or an assessment portal. These are the ones we check each release."
            center
          />
        </Container>

        {/*
          Deliberately OUTSIDE the Container. A row that slides has to run off
          both edges of the SCREEN to read as continuous; clipped to max-w-6xl
          it would look like a box that happens to be animating. <Ticker /> on
          the landing page is placed the same way, for the same reason.
        */}
        <div>
          {/*
            Mounted once, outside the row that duplicates its items. Teams and
            Webex are gradient logos, and their paint servers have to exist
            exactly once in the document — see the note in PlatformMarks.jsx.
            Renders nothing visible.

            SPLIT 2026-09-01: easier to guarantee now, not harder — the marquee
            renders on this one route rather than on the only page there was.
          */}
          <PlatformMarkDefs />

          {/*
            LOGOS 2026-08-30 (second pass): the card grid became one
            auto-scrolling line and the marks went 30px -> 48px. Eight cards at
            that size are far wider than any viewport, so the row scrolls
            instead of wrapping — reusing the copy ticker's marquee
            (`.ticker-row` in globals.css), which brings hover-to-pause and the
            reduced-motion stop with it.

            MEETING_PLATFORMS is rendered TWICE. The keyframe translates by
            exactly -50%, so the second copy is what occupies the viewport at the
            moment the first wraps; drop it and the loop visibly jumps. The
            duplicate is aria-hidden so the list is announced once, and the
            grid's `stagger` is gone — a per-item entrance delay is invisible on
            a row that is already sliding.

            <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {MEETING_PLATFORMS.map((p, i) => (
                <div key={p.key} className="stagger bg-paper p-7" style={{ '--i': i }}>
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-canvas-2 text-ink-soft">
                    <PlatformMark name={p.key} size={30} />
                  </span>
                  <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
                  <p className="mono mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
                    <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                    Supported
                  </p>
                </div>
              ))}
            </div>
          */}
          <div
            className="mark-strip ticker relative mt-16 overflow-hidden"
            style={{
              maskImage:
                'linear-gradient(90deg, transparent, #000 6rem, #000 calc(100% - 6rem), transparent)',
              WebkitMaskImage:
                'linear-gradient(90deg, transparent, #000 6rem, #000 calc(100% - 6rem), transparent)',
            }}
          >
            <div className="ticker-row marks">
              {[...MEETING_PLATFORMS, ...MEETING_PLATFORMS].map((p, i) => (
                <div
                  key={i}
                  aria-hidden={i >= MEETING_PLATFORMS.length}
                  className="mx-3 flex shrink-0 items-center gap-5 rounded-2xl border border-line bg-paper py-6 pl-6 pr-9"
                >
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-canvas-2 text-ink-soft">
                    <PlatformMark name={p.key} size={48} />
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="block text-[17px] font-semibold text-ink">{p.name}</span>
                    <span className="mono mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                      Supported
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Container wide>
          <p className="mt-10 text-center text-[15px] text-muted">
            Not listed? If it runs in a window on macOS or Windows, it works.
          </p>
        </Container>
      </Reveal>

      {/* ══════════════════════════════════════════ 04 limits ═════════ */}
      {/*
        PIVOT 2026-08-29: every line is a real property of the build — nothing is
        persisted server-side beyond a request record, and no audio is written to
        disk. Deliberately says nothing about the window being visible or hidden;
        see the banner at the top of app/layout.js. Full note in content/limits.js.
      */}
      <Reveal as="section" id="limits" className="scroll-mt-24 border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="04"
            label="What it does not do"
            title="The short list of things it will not help with."
            lede="Worth knowing before you pay for it rather than after."
          />

          <div className="mt-16 grid gap-x-12 gap-y-9 sm:grid-cols-2">
            {LIMITS.map(([title, body], i) => (
              <div key={title} className="stagger flex gap-3.5" style={{ '--i': i }}>
                <Icon name="minus" size={17} className="mt-0.5 shrink-0 text-faint" />
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Reveal>

      <CloseCard
        title="You have read what it will not do. That is the honest half."
        lede="Ten free minutes on signup decides the other half faster than this page can."
      />
    </>
  )
}
