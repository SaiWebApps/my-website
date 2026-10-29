import brand from './brand.generated.json';

export interface ClaimRef {
  id: string;
  value: string;
  sourcePath: string;
  sourceLine: number;
}

export interface EvidenceItem {
  value: string;
  label: string;
  detail: string;
  claim: ClaimRef;
}

export interface FrameworkStage {
  id: 'architecture' | 'implementation' | 'adoption' | 'roi';
  label: string;
  title: string;
  body: string;
  evidence: string;
  claim: ClaimRef;
}

export interface MetricEvidence {
  value: string;
  label: string;
  claim: ClaimRef;
}

export interface LeadershipCaseStudy {
  slug: string;
  organization: string;
  title: string;
  situation: string;
  responsibility: string;
  decisions: string[];
  scope: string;
  result: string;
  claims: ClaimRef[];
  narrative?: string;
  metrics?: MetricEvidence[];
  testimonial?: Testimonial;
}

export interface Venture {
  slug: string;
  name: string;
  thesis: string;
  problem: string;
  role: string;
  system: string;
  state: string;
  lesson: string;
  claim: ClaimRef;
}

export interface ResearchItem {
  slug: string;
  title: string;
  subtitle?: string;
  authors: string;
  venue: string;
  summary: string;
  href?: string;
  visual: 'layers' | 'apprenticeship' | 'swarm';
  claim: ClaimRef;
}

export interface Testimonial {
  quote: string;
  person: string;
  role: string;
  claim: ClaimRef;
}

export interface EngagementOffering {
  slug: string;
  title: string;
  audience: string;
  format: string;
  outcome: string;
  proof: string;
  subject: string;
  claim: ClaimRef;
}

export interface SpeakingTopic {
  title: string;
  promise: string;
}

export interface RecordEntry {
  title: string;
  detail?: string;
  href?: string;
  claim?: ClaimRef;
}

export interface FullRecordSection {
  id: string;
  title: string;
  introduction: string;
  entries: RecordEntry[];
}

type BrandClaim = (typeof brand.claims)[number];

export function claim(value: string): ClaimRef {
  const row = [...brand.claims].reverse().find((item: BrandClaim) => item.object_text === value);
  if (!row) throw new Error(`Missing sourced brand claim: ${value}`);
  return {
    id: row.id,
    value: row.object_text,
    sourcePath: row.source_path,
    sourceLine: Number(row.source_line),
  };
}

// User-approved clarification, 26 October 2026; the current résumé supersedes the legacy graph wording.
const alexaAccuracyClaim: ClaimRef = {
  ...claim('Model accuracy 40% at Amazon Alexa'),
  value: '40% improvement in end-to-end ASR and routing accuracy at Amazon Alexa',
  sourcePath: 'public/assets/Resume.pdf',
  sourceLine: 1,
};

export const frameworkStages: FrameworkStage[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    title: 'Solid. Modular. Scalable.',
    body: 'Define the model, boundaries, and failure modes before scale turns ambiguity into cost.',
    evidence: 'A canonical media graph unified more than fifteen sources.',
    claim: claim('Apple media knowledge graph unifying 15+ sources'),
  },
  {
    id: 'implementation',
    label: 'Implementation',
    title: 'Build for coordinated change.',
    body: 'Turn the architecture into clear ownership, observable flows, and an operating rhythm teams can carry.',
    evidence: 'I lead eight engineers and own their performance reviews and development.',
    claim: claim('An eight-engineer team across three continents'),
  },
  {
    id: 'adoption',
    label: 'Adoption',
    title: 'Make the system useful.',
    body: 'Connect the platform to the product experiences and teams whose behavior must actually change.',
    evidence: 'The resulting platforms served more than 100 million users.',
    claim: claim('Platforms serving more than 100 million users'),
  },
  {
    id: 'roi',
    label: 'ROI',
    title: 'Measure what moved.',
    body: 'Close the loop with evidence that joins technical quality, delivery speed, and business consequence.',
    evidence: 'Data quality improved 40% while delivery accelerated 30%.',
    claim: claim('40% better data quality and 30% faster delivery at Apple'),
  },
];

export const evidence: EvidenceItem[] = [
  { value: '100M+', label: 'users served', detail: 'AI and data platforms at Apple', claim: claim('Platforms serving more than 100 million users') },
  { value: '$40M', label: 'annual impact', detail: 'savings delivered at Amazon Alexa', claim: claim('$40M per year at Amazon Alexa') },
  { value: '8', label: 'engineers led', detail: 'performance reviews, hiring, and development at Apple', claim: claim('An eight-engineer team across three continents') },
  { value: '300+', label: 'leaders addressed', detail: 'Eagles Care Summit 2026', claim: claim('Eagles Care Summit 2026 before more than 300 leaders') },
];

export const leadershipCases: LeadershipCaseStudy[] = [
  {
    slug: 'knowledge-graph', organization: 'Apple', title: 'Media intelligence, from identity to model evaluation',
    situation: 'Search, recommendations, and discovery depended on fragmented metadata and inconsistent models.',
    responsibility: 'I lead architecture, AI/ML engineering, and an eight-engineer team, including performance reviews, hiring, and engineer development.',
    decisions: ['Integrated supervised classifier outputs with human corrections and canonical identities', 'Built graph-grounded evaluation and structured correction feedback for foundation models', 'Made partial and complete curation available through an event-driven platform'],
    scope: 'Eight engineers across three continents, serving more than 100 million users.',
    result: 'Improved data quality by 40% and accelerated delivery by 30%.',
    claims: [claim('Apple media knowledge graph unifying 15+ sources'), claim('An eight-engineer team across three continents'), claim('Platforms serving more than 100 million users'), claim('40% better data quality and 30% faster delivery at Apple')],
    narrative: 'I connect candidate generation, human labels, classifier predictions, and canonical identities to the experiences people use. The same graph now grounds a delivered evaluation workflow for Gemini and internal foundation models: verify media claims, identify specific discrepancies, and supply structured corrections in subsequent model queries.',
    metrics: [
      { value: '40%', label: 'better data quality', claim: claim('40% better data quality and 30% faster delivery at Apple') },
      { value: '30%', label: 'faster delivery', claim: claim('40% better data quality and 30% faster delivery at Apple') },
    ],
    testimonial: {
      quote: 'Sairam has established himself as Trinity’s expert on our curation infrastructure.',
      person: 'Apple manager review',
      role: '2025 performance review',
      claim: claim('Apple manager review'),
    },
  },
  {
    slug: 'music-credits', organization: 'Apple', title: 'Real-time credits, one integrated flow',
    situation: 'Batch processing and separate real-time and curation paths duplicated business logic and slowed updates.',
    responsibility: 'I led the global Credits launch, built the graph and curation infrastructure, and aligned product delivery with the streaming migration.',
    decisions: ['Won Operations, PM, and client-team support for platform and product sequencing', 'Consolidated three processing paths into one flow', 'Delivered the Sticky Credits port in one sprint after the migration'],
    scope: 'A fifteen-engineer program across four international sites.',
    result: 'Shipped the migration and Credits port to production; the platform transition reduced average processing time from approximately 60 hours to one minute.',
    claims: [claim('Apple Music Credits launch with a 15-engineer program across four international sites')],
    narrative: 'I used recurring defects to make the architecture problem concrete for Operations, connected the migration to quality and delivery timelines for PMs, and used prototypes to show client teams the simpler integration. Sequencing the work around an already-underway migration let the product inherit one maintainable flow.',
    metrics: [{ value: '15', label: 'engineers in the launch program', claim: claim('Apple Music Credits launch with a 15-engineer program across four international sites') }],
  },
  {
    slug: 'alexa', organization: 'Amazon Alexa', title: 'Better speech-to-action decisions, lower operating cost',
    situation: 'Alexa needed to connect recognized speech to the right skills and preserve context across compound requests.',
    responsibility: 'I led eight engineers, owned reviews and hiring, and redesigned key mechanisms in Alexa’s orchestration router.',
    decisions: ['Prefetched common queries and results using skill-specific cache semantics', 'Moved processing closer to ASR so context arrived earlier', 'Fed recurring intent associations back into recognition and hypothesis selection'],
    scope: 'Alexa Core Engine, connecting ASR to skills and AWS Lambda functions.',
    result: 'Improved end-to-end ASR and routing accuracy 40%, measured before and after the changes; the aggregation platform saved $40M annually.',
    claims: [claim('$40M per year at Amazon Alexa'), alexaAccuracyClaim],
    narrative: 'A compound request needs more than two independent routes. I preserved the relationship between its intents and used recurring associations to inform recognition itself, while skill-aware prefetching and early processing reduced redundant downstream work.',
    metrics: [
      { value: '$40M', label: 'saved per year', claim: claim('$40M per year at Amazon Alexa') },
      { value: '40%', label: 'better end-to-end ASR and routing accuracy', claim: alexaAccuracyClaim },
    ],
  },
];

export const testimonials: Testimonial[] = [
  { quote: 'I am confident Sai will excel as a high-impact manager and a purpose-driven leader. Any organization would be fortunate to have him.', person: 'Jonas Pulver', role: 'Wharton EMBA learning team peer', claim: claim('Jonas Pulver') },
  { quote: 'Sairam will make a tangible impact on any engineering organization.', person: 'Gajendra Babu Thokala', role: 'Senior Engineering Leader, Apple', claim: claim('Gajendra Babu Thokala') },
  { quote: 'Sairam has established himself as Trinity’s expert on our curation infrastructure. He is a valuable team player, always willing to help others.', person: 'Apple manager review', role: '2025 performance review', claim: claim('Apple manager review') },
];

export const fullTestimonials: Testimonial[] = [
  ...testimonials.slice(0, 2),
  { quote: 'He is usually the first person in the team to step forward to take up any challenge. He is technically very strong and always puts extra effort to get things moving.', person: 'Manoj Mandam', role: 'Principal Engineer · Amazon colleague', claim: claim('Manoj Mandam') },
  { quote: 'Sairam is a great engineer; he’s very knowledgeable when it comes to system design and continuously seeks out new ways to improve the projects he works on.', person: 'Connie Yao', role: 'Software Engineer · Amazon colleague', claim: claim('Connie Yao') },
  { quote: 'Sairam is very detail oriented and at the same time has a bias for action. He often comes up with new tools and ideas for simplification.', person: 'Xinghai Zhang', role: 'Software Engineer · teammate', claim: claim('Xinghai Zhang') },
  { quote: 'The requirements were initially soft and he was willing and able to iterate back and forth as the requirements became clear. The jobs run reliably every day without intervention.', person: 'Wayne Carson', role: 'Senior Data Engineer · SIG colleague', claim: claim('Wayne Carson') },
  { quote: 'Sairam is a quick learner and eager to tackle different technical problems. Sairam is great to work with and makes the team better with his contributions.', person: 'Andy Davidson', role: 'Software Engineer · teammate', claim: claim('Andy Davidson') },
];

export const managerReviews: Testimonial[] = [
  { quote: 'Sairam consistently collaborated with various members of the team to deliver on some of the key projects from the team. Sairam had a key role to play in its success.', person: 'Apple manager review · 2022', role: 'Performance review', claim: claim('Apple manager review 2022') },
  { quote: 'Sairam has been instrumental in numerous key projects within the team. His dedication and effective problem-solving received commendations from various partner teams.', person: 'Apple manager review · 2023', role: 'Performance review', claim: claim('Apple manager review 2023') },
  { quote: 'Sairam made key contributions to the Nightwatch effort, leading the design of the genre work and working with stakeholders to understand the value and sign off on the design.', person: 'Apple manager review · 2024', role: 'Performance review', claim: claim('Apple manager review 2024') },
  { quote: 'Sairam has established himself as Trinity’s expert on our curation infrastructure. He is a valuable team player, always willing to help others and step in to explain a new concept, pair program, or debug a tricky problem.', person: 'Apple manager review · 2025', role: 'Performance review', claim: claim('Apple manager review 2025') },
];

export const ventures: Venture[] = [
  { slug: 'ondoway', name: 'Ondoway', thesis: 'A travel companion that adapts as you walk.', problem: 'A useful tour must connect accurate stories with personal interests, walking constraints, and the time a traveler actually has.', role: 'Co-founder & CTO. I lead technical strategy, AI architecture, and end-to-end engineering within the founding team.', system: 'Graph-grounded storytelling, deterministic itinerary planning, GPS-triggered narration, and calibrated LLM judges against frozen human labels. I trace model and prompt versions, evidence, tokens, latency, and costs—including failed attempts.', state: 'Private beta with early testers, including Wharton Executive MBA peers, and initial city support for New York City and Paris. Flutter app, FastAPI backend, and Neo4j graph.', lesson: 'I rejected a cheaper factual judge after calibration exposed false rejections of legitimate paraphrases, separating model-quality failures from truncation before making the cost decision.', claim: claim('Ondoway') },
  { slug: 'persuaider', name: 'Persuaider', thesis: 'Practice, simulate, and evaluate the hard conversation.', problem: 'Negotiation practice needs credible competing interests and feedback grounded in what was actually said and agreed.', role: 'Creator & AI Engineering Lead. I built the product, agent behavior, multiagent simulation, and evaluation systems.', system: 'Role-conditioned agents with private objectives; stateful AI-versus-AI simulations; LLM deal extraction followed by deterministic utility, walk-away, and value-left-on-the-table calculations; configurable weighted coaching rubrics.', state: 'Working interactive practice and autonomous simulations with persisted transcripts and usage. Coaching quotations and numerical references are checked in code, returned for bounded repair, and withheld if validation still fails.', lesson: 'I evaluate negotiation economics separately from conversational skill, and require the coaching to point back to its evidence.', claim: claim('Persuaider') },
  { slug: 'gestiq', name: 'Gestiq', thesis: 'Deliberate desktop actions from hand motion.', problem: 'Camera input is uncertain; useful gesture control must distinguish an intentional action from jitter, tracking loss, and return motion.', role: 'Creator. I designed and built the native macOS product, extending my CMU hand-controlled 2048 capstone.', system: 'On-device Apple Vision hand-pose estimation, palm-normalized temporal recognition, two-hand controls, and application- and website-aware command routing. Latest-frame processing, target revalidation, and live diagnostics connect perception to guarded actions.', state: 'Working macOS application with a SwiftUI interface, menu-bar controls, and local camera processing without uploading video.', lesson: 'I carry confidence, timing, and target identity through the whole perception-to-action path, including the final dispatch check.', claim: { id: 'session:gestiq-2026-10-26', value: 'Gestiq: on-device computer vision and contextual gesture control', sourcePath: 'public/assets/Resume.pdf', sourceLine: 1 } },
  { slug: 'lore', name: 'Lore / DependIQ', thesis: 'The verification layer AI coding agents lack.', problem: 'Repository-local tooling cannot explain the organization-wide blast radius of a dependency change.', role: 'Designed the product, graph model, algorithms, and senior-engineer audit.', system: 'PostgreSQL for identity and history, Neo4j for dependency traversal, and task-aware model routing across hosted and local models.', state: 'Working multi-tenant product with more than 200 tests.', lesson: 'AI-assisted engineering needs explicit dependency truth before it needs another generator.', claim: claim('Lore / DependIQ') },
  { slug: 'crucible', name: 'Crucible', thesis: 'Engineering workflows that make agents show their work.', problem: 'An agent’s confident report is insufficient evidence that a change is correct, complete, or recoverable.', role: 'I turn engineering judgment into reusable agent workflows, adversarial review, and executable acceptance rules.', system: 'Structured agent reports, claim-level evidence checks, risk-based verification, mutation and undo evidence, concurrent review, and bounded revision loops.', state: 'Public toolkit with runtime hooks and regression tests. Separately, my internal agent-engineering work supports daily operations and was adopted and extended by QA, Operations, and upstream/downstream teams.', lesson: 'I separate model judgment from the code that checks evidence structure, enforces workflow decisions, and controls when work can proceed.', claim: claim('Crucible (claude-kit)') },
];

export const research: ResearchItem[] = [
  { slug: 'drone-megaddon', title: 'Drone-Megaddon', subtitle: 'A Real-Time Strategy Interface for Managing Drone Swarms', authors: 'Sairam Krishnan, Daniel Ting', venue: '2014 project · engrXiv archive, 2026', summary: 'I co-built an end-to-end Android, radio, and embedded-control prototype that translated real-time strategy interactions into drone commands. The 2014 work established the command interface and execution path; Drone-Megaddon 2026 extends that foundation with a proposed language-and-vision architecture for operator-supervised coordination.', href: 'https://doi.org/10.31224/6924', visual: 'swarm', claim: claim('Drone-Megaddon') },
  { slug: 'drone-megaddon-2026', title: 'Drone-Megaddon 2026', subtitle: 'Co-Intelligent Swarm Control with Language and Vision Models', authors: 'Sairam Krishnan, Daniel Ting', venue: 'engrXiv, 2026', summary: 'I coauthored a proposed extension of our built 2014 drone-control prototype: translate operator language into checked commands, ground references in video and track targets, then coordinate assignments across drones. The architecture places language and vision models inside an operator-supervised system, with explicit choices about edge versus cloud execution, latency, bandwidth, and degraded connectivity. An illustrative search-and-rescue trace shows how the layers work together.', href: 'https://doi.org/10.31224/6987', visual: 'swarm', claim: claim('Drone-Megaddon') },
  { slug: 'who-trains-the-next-senior', title: 'Who Trains the Next Senior?', subtitle: 'Managing Software Engineering When AI Makes Code Cheap', authors: 'Sairam Krishnan, Gajendra Babu Thokala', venue: 'SSRN, 2026', summary: 'I coauthored a framework for leading engineering organizations when AI makes code abundant but verification and judgment remain scarce. It connects review theater, engineer development, and team incentives to practical changes: smaller reviewable units, scrutiny matched to consequence, evidence-backed gates, and outcome-based metrics. An exploratory analysis of several thousand enterprise commits illustrates why raw activity can overstate progress; the paper turns those observations into testable propositions about verification and apprenticeship.', href: 'https://doi.org/10.2139/ssrn.7083078', visual: 'apprenticeship', claim: claim('Who Trains the Next Senior?') },
  { slug: 'ai-roi', title: 'A Multi-Layer Framework for Evaluating the Return on Investment of AI Projects', authors: 'Sairam Krishnan, Andrea Hepp, Sonia Gandhi', venue: 'SSRN, 2026', summary: 'I coauthored a decision framework connecting AI strategy to investment and execution: assess organizational readiness, trace business value through ROIC, phase investment through evidence-based gates, and synthesize a decision scorecard. An eight-category risk assessment makes inference economics, vendor dependency, and organizational friction explicit. Eight illustrative public-company cases, from Salesforce and Spotify to JPMorgan and NatWest, show how the framework changes investment conditions across deployment types.', href: 'https://doi.org/10.2139/ssrn.6732598', visual: 'layers', claim: claim('A Multi-Layer Framework for Evaluating the ROI of AI Projects') },
];

export const offerings: EngagementOffering[] = [
  { slug: 'roi-advisory', title: 'AI portfolio and ROI advisory', audience: 'Executives deciding which AI initiatives deserve funding and what evidence should unlock the next tranche.', format: 'Focused advisory sprint, portfolio review, or executive working session.', outcome: 'A decision framework, explicit risks, stage gates, and a defensible path from conviction to capital allocation.', proof: 'Grounded in first-author research using eight enterprise case studies.', subject: 'AI portfolio and ROI advisory inquiry', claim: claim('AI portfolio and ROI advisory') },
  { slug: 'platform-strategy', title: 'Engineering leadership and platform strategy', audience: 'Leaders navigating platform architecture, operating-model friction, or distributed execution.', format: 'Architecture and organization review, leadership offsite, or ongoing advisory.', outcome: 'Clearer technical boundaries, ownership, decision rights, and an execution model tied to business outcomes.', proof: 'Draws on platforms serving more than 100 million users and leadership across three continents.', subject: 'Engineering leadership and platform strategy inquiry', claim: claim('Engineering leadership and platform strategy') },
  { slug: 'workshops', title: 'Workshops, teaching, and keynotes', audience: 'Executive teams, engineering organizations, universities, and conferences.', format: 'Keynote, fireside conversation, executive workshop, or guest teaching session.', outcome: 'A technically credible shared language that changes how leaders fund AI and develop engineering talent.', proof: 'Executive curriculum design, teaching 105+ students, and a keynote for more than 300 leaders.', subject: 'Workshop or speaking inquiry', claim: claim('Executive workshops, teaching, and keynote speaking') },
];

export const speakingTopics: SpeakingTopic[] = [
  { title: 'The real ROI of AI', promise: 'How leaders can fund, stage, compare, and stop AI investments with discipline.' },
  { title: 'From architecture to adoption', promise: 'Why technical decisions only matter when teams can carry them into the organization.' },
  { title: 'Engineering leadership in the agentic era', promise: 'How management systems change when software production becomes abundant.' },
  { title: 'Who trains the next senior?', promise: 'How to rebuild engineering apprenticeship when AI absorbs traditional junior work.' },
];

export const career = [
  ['2021–Present', 'Apple', 'Principal Software Engineer · Team Lead since 2022', claim('Apple, Principal Software Engineer and AI/ML platform lead, 2021–Present')],
  ['2018–2021', 'Amazon', 'Senior Software Engineer, Alexa', claim('Amazon, Senior Software Engineer for Alexa, 2018–2021')],
  ['2016–2018', 'Susquehanna International Group', 'Senior Financial Data Engineer', claim('Susquehanna International Group, Senior Financial Data Engineer, 2016–2018')],
  ['2015–2016', 'Microsoft', 'Software Development Engineer, Windows OS Group', claim('Microsoft, Software Development Engineer in the Windows OS Group, 2015–2016')],
  ['2014', 'Amazon Web Services', 'Software Engineering Intern', claim('Amazon Web Services, Software Engineering Intern, 2014')],
  ['2013–2014', 'LeanFM Technologies', 'Full-Stack Developer', claim('LeanFM Technologies, Full-Stack Developer, 2013–2014')],
] as const;

const uniquePortfolioClaims = Array.from(new Map(
  brand.claims
    .filter((item: BrandClaim) => item.tier === 'portfolio' && item.object_text.includes(' — '))
    .map((item: BrandClaim) => [item.object_text, item]),
).values());

export const repositoryArchive: RecordEntry[] = uniquePortfolioClaims.map((item: BrandClaim) => {
  const [title, ...detail] = item.object_text.split(' — ');
  return { title, detail: detail.join(' — '), href: `https://github.com/SaiWebApps/${title}`, claim: claim(item.object_text) };
});

export const fullRecordSections: FullRecordSection[] = [
  {
    id: 'career',
    title: 'Career',
    introduction: 'The complete professional chronology, with formal titles preserved.',
    entries: career.map(([dates, company, role, source]) => ({ title: company, detail: `${dates} · ${role}`, claim: source })),
  },
  {
    id: 'education',
    title: 'Education',
    introduction: 'Formal study across engineering, management, finance, strategy, and operations.',
    entries: [
      { title: 'The Wharton School', detail: 'Executive MBA, Class of 2026, with five majors.', claim: claim('Wharton Executive MBA, Class of 2026, with five majors') },
      { title: 'Carnegie Mellon University', detail: 'Dual degrees in Electrical and Computer Engineering.', claim: claim('Dual degrees in Electrical and Computer Engineering from Carnegie Mellon') },
    ],
  },
  {
    id: 'honors',
    title: 'Honors',
    introduction: 'Academic distinctions and the original supporting letters.',
    entries: [
      { title: 'Benjamin Franklin Award', detail: 'One of three recipients in a class of 250.', claim: claim('Benjamin Franklin Award, one of three in a class of 250') },
      { title: 'Palmer Scholar and Graduation With Honors', claim: claim('Palmer Scholar and Graduation With Honors') },
      { title: "Director's List in all six terms", claim: claim("Wharton Director's List in all six terms") },
      { title: 'First Year Honors', href: '/letters/first-year-honors.pdf', claim: claim('Wharton First Year Honors letter') },
      { title: "Director's List · Summer 2024", href: '/letters/directors-list-summer-2024.pdf', claim: claim("Wharton Director's List letter, Summer 2024") },
      { title: "Director's List · Fall 2024", href: '/letters/directors-list-fall-2024.pdf', claim: claim("Wharton Director's List letter, Fall 2024") },
      { title: "Director's List · Spring 2025", href: '/letters/directors-list-spring-2025.pdf', claim: claim("Wharton Director's List letter, Spring 2025") },
    ],
  },
  {
    id: 'teaching',
    title: 'Teaching and speaking',
    introduction: 'Work translating technical systems into shared executive and classroom judgment.',
    entries: [
      { title: 'Executive AI curriculum', detail: 'Designed for evaluating, governing, and implementing AI initiatives.', claim: claim('Executive curriculum for evaluating, governing, and implementing AI') },
      { title: 'Eagles Care Summit 2026', detail: 'Keynote before more than 300 leaders.', claim: claim('Eagles Care Summit 2026 before more than 300 leaders') },
      { title: 'Carnegie Mellon Head TA', detail: 'Web Applications Development for more than 105 students.', claim: claim('Carnegie Mellon Head TA for 105+ students') },
    ],
  },
  {
    id: 'assets',
    title: 'Documents',
    introduction: 'Primary materials for recruiting and verification.',
    entries: [
      { title: 'Résumé', href: '/assets/Resume.pdf', claim: claim('Résumé') },
      { title: 'ORCID research record', href: 'https://orcid.org/0009-0004-2626-1273' },
      { title: 'GitHub engineering archive', href: 'https://github.com/SaiWebApps' },
    ],
  },
];
