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
  thesis: string;
  venue: string;
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
    evidence: 'Eight engineers worked across three continents.',
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
  { value: '8 / 3', label: 'engineers / continents', detail: 'a distributed team led at Apple', claim: claim('An eight-engineer team across three continents') },
  { value: '300+', label: 'leaders addressed', detail: 'Eagles Care Summit 2026', claim: claim('Eagles Care Summit 2026 before more than 300 leaders') },
];

export const leadershipCases: LeadershipCaseStudy[] = [
  {
    slug: 'knowledge-graph', organization: 'Apple', title: 'A shared knowledge layer for media',
    situation: 'Search, recommendations, and discovery depended on fragmented metadata and inconsistent models.',
    responsibility: 'Led architecture and cross-functional delivery of a canonical media knowledge graph.',
    decisions: ['Unified more than fifteen sources around one model', 'Moved critical ingestion from batch toward event-driven processing', 'Built quality and operational leverage into the platform'],
    scope: 'Eight engineers across three continents, serving more than 100 million users.',
    result: 'Improved data quality by 40% and accelerated delivery by 30%.',
    claims: [claim('Apple media knowledge graph unifying 15+ sources'), claim('An eight-engineer team across three continents'), claim('Platforms serving more than 100 million users'), claim('40% better data quality and 30% faster delivery at Apple')],
    narrative: 'The difficult part was not choosing a graph. It was creating one technical truth that teams in different disciplines and locations could build on together.',
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
    slug: 'music-credits', organization: 'Apple', title: 'A global launch with one operating rhythm',
    situation: 'Apple Music Credits required coordinated delivery across teams, sites, and technical boundaries.',
    responsibility: 'Directed the program from architecture alignment through global launch.',
    decisions: ['Made ownership and dependencies visible', 'Connected technical decisions to launch readiness', 'Kept geographically distributed contributors aligned'],
    scope: 'A fifteen-engineer program across four international sites.',
    result: 'Turned a cross-site initiative into a coordinated global release.',
    claims: [claim('Apple Music Credits launch with a 15-engineer program across four international sites')],
    narrative: 'The architecture mattered, but the launch depended on a shared operating rhythm: visible dependencies, explicit ownership, and decisions made at the level where they could move.',
    metrics: [{ value: '15 / 4', label: 'engineers / international sites', claim: claim('Apple Music Credits launch with a 15-engineer program across four international sites') }],
  },
  {
    slug: 'alexa', organization: 'Amazon Alexa', title: 'A technical choice with P&L consequence',
    situation: 'Large-scale data mining costs and model performance constrained the value of Alexa Core Engine.',
    responsibility: 'Developed a batching and clustering approach that changed both economics and model quality.',
    decisions: ['Reframed the workload around cost and throughput', 'Applied clustering where it improved both efficiency and signal', 'Measured the business outcome alongside model performance'],
    scope: 'A production Alexa data-mining system at hyperscale.',
    result: 'Saved $40 million per year and improved model accuracy by 40%.',
    claims: [claim('$40M per year at Amazon Alexa'), claim('Model accuracy 40% at Amazon Alexa')],
    narrative: 'The breakthrough was treating cost and model quality as one engineering problem. Reframing the workload improved the economics and the intelligence of the system at the same time.',
    metrics: [
      { value: '$40M', label: 'saved per year', claim: claim('$40M per year at Amazon Alexa') },
      { value: '40%', label: 'better model accuracy', claim: claim('Model accuracy 40% at Amazon Alexa') },
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
  { slug: 'ondoway', name: 'Ondoway', thesis: 'A local storyteller in your pocket.', problem: 'Walking tours rarely know where you are, what you care about, or which story belongs to the exact corner in front of you.', role: 'Designed, architected, coded, and operated end to end.', system: 'A provenance-aware Neo4j knowledge graph, deterministic tour engine, FastAPI backend, authoring tools, and Flutter mobile app.', state: 'Launch system built around Paris as the first city.', lesson: 'Generative content becomes trustworthy when every spoken sentence can trace back to a sourced beat.', claim: claim('Ondoway') },
  { slug: 'persuaider', name: 'Persuaider', thesis: 'Practice the hard conversation.', problem: 'Negotiation training is difficult to personalize, repeat, and evaluate consistently.', role: 'Built the complete product and its multi-provider AI operating model.', system: 'Scenario authoring, in-character AI personas, framework-based evaluation, security controls, and transparent model failover.', state: 'Production-grade application with a deep automated test suite.', lesson: 'An AI product becomes useful when simulation, evaluation, and operational reliability are designed as one system.', claim: claim('Persuaider') },
  { slug: 'lore', name: 'Lore / DependIQ', thesis: 'The verification layer AI coding agents lack.', problem: 'Repository-local tooling cannot explain the organization-wide blast radius of a dependency change.', role: 'Designed the product, graph model, algorithms, and senior-engineer audit.', system: 'PostgreSQL for identity and history, Neo4j for dependency traversal, and task-aware model routing across hosted and local models.', state: 'Working multi-tenant product with more than 200 tests.', lesson: 'AI-assisted engineering needs explicit dependency truth before it needs another generator.', claim: claim('Lore / DependIQ') },
  { slug: 'crucible', name: 'Crucible', thesis: 'Discipline for AI coding agents.', problem: 'Prompt-only guidance is too easy for coding agents to ignore when delivery pressure rises.', role: 'Encoded engineering practice into skills, agents, hooks, and verifiable workflows.', system: 'Ten skills, ten agents, four patterns, deterministic gates, and adversarial evidence checks.', state: 'Open-source kit used as an operational counterpart to the management research.', lesson: 'Reliable agent behavior comes from executable constraints, not aspirational prose.', claim: claim('Crucible (claude-kit)') },
];

export const research: ResearchItem[] = [
  { slug: 'who-trains-the-next-senior', title: 'Who Trains the Next Senior?', thesis: 'Managing engineering teams when AI makes code cheap.', venue: 'SSRN, 2026', href: 'https://doi.org/10.2139/ssrn.7083078', visual: 'apprenticeship', claim: claim('Who Trains the Next Senior?') },
  { slug: 'ai-roi', title: 'A Multi-Layer Framework for Evaluating the ROI of AI Projects', thesis: 'A decision system for funding, staging, and stopping enterprise AI bets.', venue: 'SSRN, 2026', href: 'https://doi.org/10.2139/ssrn.6732598', visual: 'layers', claim: claim('A Multi-Layer Framework for Evaluating the ROI of AI Projects') },
  { slug: 'drone-megaddon', title: 'Drone-Megaddon', thesis: 'Commanding autonomous swarms through high-level intent.', venue: 'engrXiv, 2014 and 2026', href: 'https://doi.org/10.31224/6924', visual: 'swarm', claim: claim('Drone-Megaddon') },
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
  ['2021–Present', 'Apple', 'Principal Software Engineer, AI/ML platform lead', claim('Apple, Principal Software Engineer and AI/ML platform lead, 2021–Present')],
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
      { title: 'Résumé', href: '/assets/Sairam_Krishnan_Resume.pdf', claim: claim('Résumé') },
      { title: 'ORCID research record', href: 'https://orcid.org/0009-0004-2626-1273' },
      { title: 'GitHub engineering archive', href: 'https://github.com/SaiWebApps' },
    ],
  },
];
