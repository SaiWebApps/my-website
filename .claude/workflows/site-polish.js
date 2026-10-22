export const meta = {
  name: 'site-polish',
  description: 'Hostile governor sets the spec; voice, Speaking-access, spotlight, 4 customer and 3 recruiter persona agents propose edits, each checked by its own shadow; governor merges; one writer applies; governor gates the diff',
  whenToUse: 'Polishing copy, structure, and positioning of the personal website',
  phases: [
    { title: 'Govern', detail: 'hostile governor writes the binding spec' },
    { title: 'Audit', detail: '7 workers propose edits, each verified by its own shadow' },
    { title: 'Rule', detail: 'governor merges approved edits; shadow checks the merge' },
    { title: 'Apply', detail: 'single writer applies the plan and builds' },
    { title: 'Gate', detail: 'governor + shadow review the diff; writer fixes until pass' },
  ],
}

const SITE = `Repo: /Users/sairambkrishnan/git/my-website (Astro). Copy lives in src/pages/*.astro, src/components/*.astro, and src/data/*.ts (career.ts, content.ts, services.ts, speaking.ts, recommendations.ts, seo.ts). Read them in full. The owner is Sairam Krishnan, a senior engineering leader (Apple AI/ML, ex-Amazon Alexa) selling services (architecture calls, reviews, audits, AI ROI reviews, evals harnesses, retainers, masterclasses, keynotes).
TWO AUDIENCES, EQUAL WEIGHT: (a) customers buying his services; (b) recruiters and hiring managers filling Senior Engineering Manager roles. The site must convert both. Neither may be hidden to serve the other; a recruiter must reach his management record and resume in one click, a buyer must reach Services and Speaking in one click.
Owner complaints, verbatim intent:
1. Inconsistent voice/tense, e.g. "his paper" / "he architected" on the Services page that addresses the buyer as "you".
2. Teaching & Speaking is buried: it is NOT in the header nav (src/components/SiteHeader.astro); it is only reachable from a home card and a link inside Services.
3. The site undersells him and buries his accomplishments (e.g. Services proof is hidden in a collapsed <details> "Track record").
Hard rules (CLAUDE.md): never invent facts — every claim must already exist in the repo's data files or pages; never add self-annotating text (legends, hints, "click to..."); no filler/taglines; one number per stat box; active leadership verbs; never mention compensation/salary (service prices already on the site are fine); never remove award/honor images; don't name managers/reviewers.
NEVER DELETE: no file, data export, recommendation, review quote, offering, catalog entry, figure, or source comment may be removed, even if unused. Edits change wording, order, and visibility only. If something looks like it should go, list it in your verdict for the owner instead.
NO FILLER NUMBERS: an empty stat box is better than a decorative count or a number reused from another box.`

const EDITS = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      file: { type: 'string' },
      find: { type: 'string', description: 'exact substring currently in the file, or "" for a structural change described in replace' },
      replace: { type: 'string' },
      why: { type: 'string' },
      source: { type: 'string', description: 'file:line in the repo backing any factual claim, or "none-needed" for pure wording/structure' },
    },
    required: ['file', 'find', 'replace', 'why', 'source'],
  },
}

const SPEC = {
  type: 'object',
  properties: {
    voice: { type: 'string', description: 'the single binding voice/person/tense rule for every surface' },
    navigation: { type: 'string', description: 'binding IA rules: nav items and order, where Speaking must appear' },
    spotlight: { type: 'array', items: { type: 'string' }, description: 'accomplishments that must be front and center, each with repo source' },
    bans: { type: 'array', items: { type: 'string' } },
    failures: { type: 'array', items: { type: 'string' }, description: 'every failure found, file:line, brutal and specific' },
  },
  required: ['voice', 'navigation', 'spotlight', 'bans', 'failures'],
}

const WORK = {
  type: 'object',
  properties: { verdict: { type: 'string' }, edits: EDITS },
  required: ['verdict', 'edits'],
}

const SHADOW = {
  type: 'object',
  properties: {
    approved: EDITS,
    rejected: { type: 'array', items: { type: 'object', properties: { edit: { type: 'string' }, reason: { type: 'string' } }, required: ['edit', 'reason'] } },
    missed: EDITS,
    drift: { type: 'string', description: 'how far the worker drifted from the governor spec' },
  },
  required: ['approved', 'rejected', 'missed', 'drift'],
}

phase('Govern')
const spec = await agent(`You are the GOVERNOR of this website: hostile, impatient, and impossible to impress. You have been burned by this site repeatedly and you assume every line is wrong until proven otherwise. ${SITE}
Read every page and data file. Then write the binding spec every other agent must obey. It must serve BOTH audiences (customers and Senior Engineering Manager recruiters):
- voice: ONE rule for person and tense on every surface (hero, services, speaking, career, projects, research, contact, meta descriptions). The site is his own; a mix of "I", "he/his", and subjectless fragments is the failure to kill. Decide and state it exactly, including how proof bullets read.
- navigation: the exact header nav (order and labels) and every route by which Teaching & Speaking must be reachable. Speaking must be one click from anywhere.
- spotlight: the accomplishments that must be impossible to miss, each with its repo file:line. Strongest first. Only facts in the repo.
- bans: patterns that are forbidden.
- failures: every failure you see, file:line, no mercy.`, { label: 'governor', phase: 'Govern', schema: SPEC })

const SPECTXT = JSON.stringify(spec, null, 2)

const WORKERS = [
  { key: 'voice', prompt: `You are the VOICE editor. Sweep every user-facing string (pages, components, data files, meta titles/descriptions, schema descriptions) and make person, tense, and register consistent with the governor's voice rule. Also fix anything unclean, hard to read, or flat. Propose exact find/replace edits. Cover the WHOLE site, not just Services.` },
  { key: 'access', prompt: `You are the ACCESS agent. Make Teaching & Speaking impossible to miss: header nav (src/components/SiteHeader.astro), home page chapter order and hero/proof routes, Services masterclass/keynote sections, contact page, footer. Also check every other page is reachable in one click and nothing important sits behind collapsed <details> or deep anchors. Propose exact edits (structural edits allowed: put the full new code in replace).` },
  { key: 'spotlight', prompt: `You are the SPOTLIGHT agent. He is being undersold. Find every accomplishment in src/data/career.ts, content.ts, recommendations.ts, speaking.ts that is buried, hedged, understated, or missing from the places a buyer looks first (home hero line, home proof, Services hero, Services proof, Speaking hero). Propose edits that put the strongest sourced facts and verbatim recommendation language up front with active leadership verbs. Unhide the Services track record if it is collapsed. Every number must exist verbatim in the repo.` },
  { key: 'persona-cto', prompt: `You are a PROSPECTIVE CUSTOMER: CTO of a 60-engineer Series B startup whose data platform is buckling and whose first LLM feature hallucinates. You have 4 minutes and compare three consultants. Walk the site as that buyer (home, then Services, then wherever you would click). Decide: would you book, and which offer? List every point where you would bounce or hesitate. Then retool: propose exact edits to services.ts and services.astro (offer names, abstracts, ordering, what you get, proof placement, call to action) that would make you book. Only facts in the repo.` },
  { key: 'persona-enterprise', prompt: `You are a PROSPECTIVE CUSTOMER: VP of Engineering at a Fortune 500 company with a procurement process, considering an architecture audit and an advisory retainer. You need credibility signals fast (scale numbers, brand names, published work) and clarity on scope and deliverables. Walk the site, decide whether you would engage, list every hesitation, and propose exact edits to make the services and proof convincing to you. Only facts in the repo.` },
  { key: 'persona-events', prompt: `You are a PROSPECTIVE CUSTOMER: an events director booking a keynote speaker and an executive AI workshop for a 400-person industry summit. Find his speaking record, topics, past audiences, and how to book. Time how many clicks it takes. Decide whether you would book him, list every hesitation, and propose exact edits (nav, Speaking page, keynote and masterclass offers) that would get you to book. Only facts in the repo.` },
  { key: 'recruiter-inhouse', prompt: `You are an IN-HOUSE TECHNICAL RECRUITER at a large tech company filling a Senior Engineering Manager role (manages managers or 8–20 engineers, AI/data platform). You spend 90 seconds on a candidate site before deciding to reach out. You look for: current title and scope, team size, people outcomes (hiring, promotions, mentoring), business impact, brand names, education, location, and a resume link. Services pages make you wonder if he is really available for a full-time role. Walk the site, decide whether you would reach out, list every hesitation, and propose exact edits so the site sells him as a Senior Engineering Manager without hurting the services business. Only facts in the repo.` },
  { key: 'recruiter-hm', prompt: `You are a DIRECTOR OF ENGINEERING (the hiring manager) for a Senior Engineering Manager opening on an ML/data platform org. You read deeply: how he leads people, sets technical direction, handles cross-functional delivery, grows engineers, and what peers and partners say about him. Walk the site (especially Career, home, and any recommendations), decide whether you would ask your recruiter to schedule a screen, list every hesitation and every claim that reads as IC work rather than leadership, and propose exact edits. Only facts in the repo.` },
  { key: 'recruiter-search', prompt: `You are an EXECUTIVE SEARCH PARTNER building a shortlist for Head of Engineering / Senior Engineering Manager roles at AI companies. You need a crisp positioning line, a scannable leadership record, proof of executive presence (keynotes, C-suite teaching, Wharton), and an easy way to contact him and download a resume. Walk the site, decide whether he makes your shortlist, list every hesitation, and propose exact edits. Only facts in the repo.` },
  { key: 'persona-exec', prompt: `You are a PROSPECTIVE CUSTOMER: a non-technical COO at a mid-market firm whose board wants an AI strategy and a defensible answer on which AI projects to fund. Jargon loses you. Walk the site, decide whether you would engage (AI ROI review, masterclass, retainer), list every hesitation and every line you could not parse, and propose exact edits that would make you reach out. Only facts in the repo.` },
]

phase('Audit')
const audited = await pipeline(
  WORKERS,
  w => agent(`${w.prompt}
${SITE}
BINDING GOVERNOR SPEC (obey it exactly):
${SPECTXT}
Return a one-paragraph verdict and the full list of edits. "find" must be an exact substring of the current file.`, { label: `worker:${w.key}`, phase: 'Audit', schema: WORK }),
  (work, w) => agent(`You are the SHADOW of the "${w.key}" agent. Your only job: keep it on track and in sync with the governor.
${SITE}
GOVERNOR SPEC:
${SPECTXT}
WORKER OUTPUT:
${JSON.stringify(work, null, 2)}
For each proposed edit: open the file, confirm "find" is an exact current substring, confirm every fact in "replace" exists in the repo (check the cited source), confirm it obeys the spec and CLAUDE.md. Approve or reject with a reason. Then list edits the worker should have made under its own brief and the spec but missed (same verification standard). Report drift.`, { label: `shadow:${w.key}`, phase: 'Audit', schema: SHADOW })
    .then(s => ({ key: w.key, verdict: work.verdict, ...s })),
)

const results = audited.filter(Boolean)
log(`${results.length}/${WORKERS.length} workers verified; ${results.reduce((n, r) => n + r.approved.length + r.missed.length, 0)} approved edits`)

phase('Rule')
const PLAN = {
  type: 'object',
  properties: {
    edits: EDITS,
    serviceChanges: { type: 'string', description: 'summary of how services were retooled and why the personas would now engage' },
    overruled: { type: 'array', items: { type: 'string' } },
  },
  required: ['edits', 'serviceChanges', 'overruled'],
}
const plan = await agent(`You are the hostile GOVERNOR again. Your spec:
${SPECTXT}
${SITE}
Here is every shadow-approved and shadow-found edit from the voice, access, spotlight, four customer-persona, and three recruiter-persona agents, with each persona's verdict:
${JSON.stringify(results.map(r => ({ agent: r.key, verdict: r.verdict, drift: r.drift, edits: [...r.approved, ...r.missed] })), null, 2)}
Merge them into ONE conflict-free, ordered edit plan. Where two edits touch the same text, pick the stronger one or write a combined one. Overrule anything weak, unsourced, or off-spec. Retool services so every customer persona would engage, and the site so every recruiter persona would reach out. Reject any edit that deletes data or offerings. Every "find" must be an exact current substring, and edits to the same file must not overlap.`, { label: 'governor:merge', phase: 'Rule', schema: PLAN })

const planCheck = await agent(`You are the SHADOW of the governor. Check the merged plan for invented facts, inexact "find" strings, overlapping edits, CLAUDE.md violations, and anything that contradicts the governor's own spec. Fix them.
${SITE}
SPEC:
${SPECTXT}
PLAN:
${JSON.stringify(plan, null, 2)}
Return the corrected plan.`, { label: 'shadow:governor', phase: 'Rule', schema: PLAN })

phase('Apply')
const applyPrompt = `You are the single WRITER. Apply this plan to the repo exactly. ${SITE}
SPEC:
${SPECTXT}
PLAN:
${JSON.stringify(planCheck, null, 2)}
Rules: never delete files, data, exports, quotes, offerings, or figures; apply every edit; after each find/replace confirm the new text is present. If services.ts changed, run "npm run sync:deck" (read scripts/sync-deck.mts first; skip with a note if it needs anything unavailable). Then run "npm run build" and "node scripts/check-copy-repetition.mjs" and fix any failures you caused. Do not commit. Return a list of files changed and build results.`
let applied = await agent(applyPrompt, { label: 'writer', phase: 'Apply' })

phase('Gate')
const GATE = {
  type: 'object',
  properties: { pass: { type: 'boolean' }, failures: { type: 'array', items: { type: 'string' } } },
  required: ['pass', 'failures'],
}
let gate = null
for (let round = 1; round <= 3; round++) {
  const g = await agent(`You are the hostile GOVERNOR. Run "git -C /Users/sairambkrishnan/git/my-website diff" and read the changed files in full. Judge the result against your spec and CLAUDE.md. Fail it for any: voice inconsistency anywhere on the site, Speaking not one click from every page, buried or understated accomplishments, invented facts, self-annotation, filler, any deleted data or offering (check the diff for removed lines), a recruiter unable to reach the management record and resume in one click, or a broken build ("npm run build").
SPEC:
${SPECTXT}`, { label: `governor:gate-${round}`, phase: 'Gate', schema: GATE })
  const s = await agent(`You are the SHADOW of the governor. Check the governor's gate verdict against the actual diff ("git -C /Users/sairambkrishnan/git/my-website diff"). Remove failures that are wrong or unsourced, add failures the governor missed. Pass only if nothing real remains.
SPEC:
${SPECTXT}
VERDICT:
${JSON.stringify(g)}`, { label: `shadow:gate-${round}`, phase: 'Gate', schema: GATE })
  gate = s
  log(`Gate round ${round}: ${s.pass ? 'PASS' : `${s.failures.length} failures`}`)
  if (s.pass) break
  applied = await agent(`You are the WRITER. Fix every failure below in the repo, verify each fix landed, rebuild with "npm run build", do not commit.
${SITE}
SPEC:
${SPECTXT}
FAILURES:
${JSON.stringify(s.failures, null, 2)}`, { label: `writer:fix-${round}`, phase: 'Gate' })
}

return {
  spec,
  personas: results.filter(r => r.key.startsWith('persona') || r.key.startsWith('recruiter')).map(r => ({ key: r.key, verdict: r.verdict, drift: r.drift, rejected: r.rejected.length })),
  serviceChanges: planCheck.serviceChanges,
  overruled: planCheck.overruled,
  applied,
  gate,
}
