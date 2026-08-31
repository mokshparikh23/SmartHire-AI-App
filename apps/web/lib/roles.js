/**
 * ROLE-SUGGEST 2026-09-01
 *
 * The role vocabulary, and the matcher over it.
 *
 * WHY A STATIC LIST AND NOT A LOOKUP. The company field next to it talks to
 * Brandfetch because company names are an open set that moves weekly and carry a
 * logo we cannot invent. Job titles are neither: the set is small, it barely
 * moves, and there is nothing to fetch. A request per keystroke would buy
 * latency, a rate limit and an offline failure mode in exchange for nothing.
 *
 * TYPING SOMETHING THAT IS NOT ON THE LIST IS A FIRST-CLASS OUTCOME, exactly as
 * it is for the company field. This list exists to save typing and to steady the
 * spelling of the titles people repeat, never to say what an interview is
 * allowed to be about. Nothing here validates, and nothing here can block a save.
 *
 * Order is curated, not alphabetical, and ties in the matcher fall back to it —
 * so an empty field opens on the titles this product is actually used for
 * instead of opening on "Android Engineer".
 */
export const ROLES = [
  // The core software ladder — the first thing most people here type.
  'SDE 1',
  'SDE 2',
  'SDE 3',
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Software Engineer',
  'Principal Engineer',
  'Engineering Manager',
  'Software Engineer Intern',

  // What the work is, for when the rung on the ladder is not the point.
  'Frontend Engineer',
  'Backend Engineer',
  'Full Stack Engineer',
  'Mobile Engineer',
  'Android Engineer',
  'iOS Engineer',

  // Data and ML.
  'Data Analyst',
  'Data Engineer',
  'Data Scientist',
  'Machine Learning Engineer',
  'MLOps Engineer',
  'Business Intelligence Analyst',

  // Infrastructure.
  'DevOps Engineer',
  'Site Reliability Engineer',
  'Cloud Engineer',
  'Platform Engineer',
  'Network Engineer',
  'Database Administrator',

  // Quality.
  'QA Engineer',
  'SDET',
  'Automation Test Engineer',

  // Security.
  'Security Engineer',
  'Security Analyst',

  // Architecture, and the consulting ladder.
  'Technical Lead',
  'Technical Architect',
  'Solution Architect',
  'Consultant',
  'Senior Consultant',

  /* The Indian IT services ladders, and they are not decoration. "Systems
     Engineer" is the TCS entry title, "Programmer Analyst" is Cognizant's and
     "Technology Analyst" is Infosys's. Someone setting up an interview at
     Capgemini or TCS — which is who the placeholder company in this form is
     already addressing — is far likelier to want one of these than
     "Principal Engineer". */
  'Systems Engineer',
  'Assistant System Engineer',
  'Associate Software Engineer',
  'Programmer Analyst',
  'Technology Analyst',
  'Senior Analyst',

  // Product, design, and the roles that sit next to engineering.
  'Product Manager',
  'Associate Product Manager',
  'Program Manager',
  'Business Analyst',
  'Product Designer',
  'UX Designer',
  'Technical Support Engineer',
  'Salesforce Developer',
  'SAP Consultant',
]

/* Comparison throws away everything that is not a letter or a digit, so "SDE2",
   "SDE 2", "sde-2" and "S.D.E. 2" are all one query. That single line is most of
   the value of this file: the list spells it "SDE 2" and close to nobody types
   the space — the placeholder in the form is literally "SDE2". */
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * Roles matching a typed query, best first.
 *
 * An empty query returns the WHOLE list rather than nothing. Focusing an empty
 * field is the one moment the user has told us they do not know what to type,
 * so it is the worst possible moment to show them an empty box; the list
 * scrolls, and curated order means the top of it is the useful part.
 *
 * A query caps at 8. The dropdown floats over the fields below it, and a filter
 * loose enough to be forgiving about spacing is also loose enough to match
 * twenty titles on "engineer" — past a point, more rows is not more help.
 */
export function searchRoles(query) {
  const q = norm(query)
  if (!q) return ROLES

  const hits = []

  ROLES.forEach((role, i) => {
    const n = norm(role)
    if (!n.includes(q)) return

    /* Three tiers, because plain `includes` ranks badly on exactly the queries
       people type. On "eng": "Engineering Manager" starts with it and should
       lead; "Data Engineer" starts a WORD with it and should come next; and
       neither should sit below something matched mid-word purely because it was
       curated higher up the file. */
    const rank =
      n.startsWith(q)                                              ? 0
      : role.split(/\s+/).some((w) => norm(w).startsWith(q))       ? 1
      :                                                              2

    hits.push({ role, rank, i })
  })

  // Curated index breaks ties, so equal-ranked matches keep the file's order
  // rather than whatever order the filter happened to visit them in.
  return hits
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, 8)
    .map((h) => h.role)
}

/** Two titles that differ only in spacing, punctuation or case are the same
 *  role — so the picker can tick the row the field is already sitting on, and
 *  "SDE2" in the box ticks "SDE 2" in the list. */
export function sameRole(a, b) {
  const x = norm(a)
  return Boolean(x) && x === norm(b)
}
