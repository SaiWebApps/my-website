// Sources: src/data/career.ts, src/data/content.ts, src/data/speaking.ts.
// Prices: researched Oct 2026 against published US rates and past speaking fees (kept off the site); evidence and sources in mockups/v3/PRICING.md.

export type Figure = { value: string; label: string };

export type ServiceGroup = 'lead' | 'engage' | 'speak';

export const groups: { id: ServiceGroup; title: string }[] = [
  { id: 'lead', title: 'Lead and advise.' },
  { id: 'engage', title: 'Engagements.' },
  { id: 'speak', title: 'Speaking and teaching.' },
];

export interface Service {
  id: string;
  name: string;
  group: ServiceGroup;
  price: number;
  unit?: 'MON';
  priceLabel: string;
  length: string;
  abstract: string;
  figures: Figure[];
  proof: string[];
  links?: { href: string; label: string; external?: boolean }[];
}

const serviceCatalog: Service[] = [
  {
    id: 'fit',
    group: 'lead',
    name: 'Fit Call',
    price: 0,
    priceLabel: 'free',
    length: 'Introductory call',
    abstract: 'A focused first conversation to decide whether the problem, the engagement, and my experience fit.',
    figures: [],
    proof: [],
  },
  {
    id: 'cto',
    group: 'lead',
    name: 'Fractional CTO',
    price: 12500,
    unit: 'MON',
    priceLabel: 'from, a month',
    length: 'Monthly, 3-month minimum',
    abstract: 'I become your technical leader, accountable for outcomes: technical strategy and roadmap, architecture and design reviews, hiring loops for your first engineers, mentoring and performance management, vendor and agency oversight, investor technical due diligence and board updates, and AI strategy and ROI decisions. Month one opens with a two-week stack audit and a 90-day plan, included.',
    figures: [{ value: '5', label: 'senior engineers on the Apple team I lead' }],
    proof: [
      'Lead an eight-engineer team at Apple, five of them senior engineers; I own performance reviews for all eight and drive hiring.',
      'Serve as co-founder and CTO of Ondoway, owning technical strategy, AI architecture, and end-to-end delivery into private beta.',
      'Lead AI and executive education at Praxtera, including client discovery, technical advisory sessions, and solution architecture for contractor implementation.',
    ],
  },
  {
    id: 'retainer',
    group: 'lead',
    name: 'Advisory Retainer',
    price: 5000,
    unit: 'MON',
    priceLabel: 'from, a month',
    length: 'About 10 hours a month',
    abstract: 'Standing access for your engineering leaders: design reviews before work starts, office hours for hard distributed-systems and AI problems, and mentoring for senior engineers growing into staff roles.',
    figures: [
      { value: '8', label: 'engineers on Apple’s knowledge graph team' },
      { value: '15', label: 'engineers in the Apple Music Credits global launch' },
    ],
    proof: [
      'Led an eight-engineer team at Apple across Seattle, London, and partner sites in Europe and Latin America.',
      'Led the four-office global launch of Apple Music Credits (Cupertino, Seattle, London, Singapore), coordinating a 15-engineer cross-functional program to deliver real-time credits curation for millions of tracks.',
      'Mentored half my Amazon team from entry level to promotion, earning selection for Amazon’s Mentorship and Leadership Development Program.',
      'Own Apple engineers’ performance reviews and review conversations, participate in calibration, drive hiring, and mentor engineers to promotion.',
      'Coauthored “Who Trains the Next Senior? Managing Software Engineering When AI Makes Code Cheap,” connecting verification, apprenticeship, and engineering outcomes (SSRN, 2026).',
    ],
    links: [{ href: '/research#who-trains-the-next-senior', label: 'The management paper' }],
  },
  {
    id: 'call',
    group: 'engage',
    name: 'Architecture Call',
    price: 500,
    priceLabel: 'from',
    length: '60 minutes',
    abstract: 'One hour on the design, scaling problem, data model, or AI build your team is stuck on. Bring the doc or the diagram; leave with a recommendation. The fee is credited in full toward any engagement below, or month one of Fractional CTO, booked within 90 days.',
    figures: [
      { value: '100M+', label: 'users on Apple’s media knowledge graph' },
      { value: '15+', label: 'sources unified into one canonical model' },
    ],
    proof: ['Lead client discovery, technical advisory sessions, and office hours at Praxtera; design AI solution architectures for contractor implementation.', 'Led architecture and cross-functional delivery of Apple’s media knowledge graph, the canonical model unifying 15+ sources to power search, recommendations, and discovery for over 100 million users.'],
  },
  {
    id: 'review',
    group: 'engage',
    name: 'Design Review',
    price: 2500,
    priceLabel: 'from',
    length: '1 week',
    abstract: 'A written review of one design doc before your team commits to building it: data models, service boundaries, failure modes, and scale. Every risk is ranked with a proposed fix, and the week closes with a call to walk your engineers through it.',
    figures: [
      { value: '45%', label: 'fewer production incidents on the Apple team' },
      { value: '30%', label: 'higher velocity on the Apple team' },
    ],
    proof: [
      'Set my Apple team’s design-review and CI/CD standards, lifting team velocity 30% and cutting production incidents 45%.',
      'Set the shared Protobuf contracts adopted across Apple’s knowledge graph platform, and owned the graph query services and the client library for partner teams to build on.',
    ],
  },
  {
    id: 'audit',
    group: 'engage',
    name: 'Architecture Audit',
    price: 15000,
    priceLabel: 'from',
    length: '2–3 weeks',
    abstract: 'A review of a whole system, not one doc: every service boundary, data contract, and dependency, and the bottlenecks, failure loops, and batch jobs that should be streams. Ends with a ranked remediation plan and a working session with your senior engineers.',
    figures: [
      { value: '$40M', label: 'saved a year on the Alexa Engine' },
      { value: '40%', label: 'higher end-to-end ASR and routing accuracy at Alexa' },
    ],
    proof: [
      'Designed Alexa’s GraphQL aggregation and orchestration platform, saving $40M annually; improved end-to-end ASR and routing accuracy 40% through skill-aware prefetching, early processing, and feedback into recognition.',
      'Drove Apple’s production migration from Spark batch processing to Flink, Kafka, and Cassandra streaming, reducing average processing time from approximately 60 hours to one minute.',
      'Designed Apple’s ML entity-resolution system, lifting data quality 40% while cutting downstream cost.',
      'Owned Alexa operational excellence, driving the weekly issue count from 40 to 10 and re-engineering the new-user registration flow to cut peak-holiday customer issues tenfold.',
      'Led Alexa capacity planning for Prime Day and Black Friday, forecasting hardware demand and winning leadership’s commitment to expand the fleet ahead of peak.',
    ],
  },
  {
    id: 'roi',
    group: 'engage',
    name: 'AI ROI Review',
    price: 15000,
    priceLabel: 'from',
    length: '2–3 weeks',
    abstract: 'I run every AI initiative on your list through the four-layer framework from my SSRN paper: a SCALE strategic readiness assessment of your firm, a value driver tree that traces each initiative to return on invested capital, a discount rate adjusted for AI-specific risks such as vendor and platform dependency and organizational friction, and stage gates that release each tranche of funding only on evidence. You get a decision scorecard that tells your executives which initiatives to fund.',
    figures: [{ value: '8', label: 'illustrative company cases, from Salesforce Agentforce to JPMorgan COiN' }],
    proof: [
      'Coauthored “A Multi-Layer Framework for Evaluating the Return on Investment of AI Projects,” integrating strategic readiness, value drivers, staged investment, and AI-specific risks (SSRN, 2026).',
    ],
    links: [{ href: 'https://doi.org/10.2139/ssrn.6732598', label: 'The framework paper', external: true }],
  },
  {
    id: 'evals',
    group: 'engage',
    name: 'Evals Harness',
    price: 20000,
    priceLabel: 'from',
    length: '3–4 weeks',
    abstract: 'A test suite that shows whether a prompt, model, or pipeline change made your AI better or worse: deterministic checks first, a golden set of real queries with expected answers, and model-graded judges where code cannot check. It runs on every code change, so no change ships without passing.',
    figures: [],
    proof: [
      'Delivered Apple’s GraphRAG evaluation and correction workflow for Gemini and internal foundation models, checking media claims against graph facts and returning structured discrepancies in subsequent model queries.',
      'Built calibrated LLM evaluation for Ondoway around a fixed rubric, frozen human labels, blinded comparisons, independent adjudication, and code-enforced acceptance criteria; connected model choices to measured quality and cost.',
      'Presented to Atos how a knowledge graph enriches questions before they reach a model and checks the model’s answer afterward.',
      'Built Persuaider’s hybrid evaluation: model-extracted deal terms, deterministic negotiation economics, weighted coaching rubrics, and code-checked quotations with bounded repair.',
      'Built Crucible’s executable acceptance rules and adversarial evidence checks, with internal foundations adopted and extended by QA, Operations, and partner teams.',
      'Designed Lore / DependIQ, a multi-tenant product with more than 200 tests.',
    ],
    links: [{ href: '/projects#persuaider', label: 'Persuaider' }, { href: '/projects#crucible', label: 'Crucible' }, { href: '/projects#lore', label: 'Lore / DependIQ' }, { href: '/talks/knowledge-graphs/index.html', label: 'The Atos deck' }],
  },
  {
    id: 'keynote',
    group: 'speak',
    name: 'Keynote',
    price: 5000,
    priceLabel: 'from, plus travel',
    length: '60 minutes',
    abstract: 'A keynote for a conference, summit, or company offsite, shaped around the audience’s AI decisions. My delivered talks include AI for Impact and Knowledge Graphs, Then Small Language Models.',
    figures: [{ value: '300+', label: 'community and business leaders at the Eagles Care Summit' }],
    proof: [
      'Keynoted the Philadelphia Eagles’ 12th annual Eagles Care Summit on March 18, 2026, delivering “AI for Impact” to more than 300 community and business leaders.',
      'Presented “Knowledge Graphs, Then Small Language Models” to Atos on September 3, 2026, with a live setup of a local model in five minutes.',
    ],
    links: [{ href: '/speaking#eagles', label: 'The Eagles keynote' }, { href: '/speaking', label: 'Speaking' }, { href: '/talks/knowledge-graphs/index.html', label: 'The Atos deck' }],
  },
  {
    id: 'masterclass',
    group: 'speak',
    name: 'Masterclass',
    price: 6000,
    priceLabel: 'from',
    length: 'Up to 3 hours',
    abstract: 'A focused session built around your team’s work. I have taught applied AI to HP teams, trained Morgan Lewis’s internal AI champions, and led practical AI programs for PBS and Sonova.',
    figures: [],
    proof: [
      'Designed Praxtera’s executive AI curriculum, built on original Wharton research to help executives evaluate, govern, and deploy AI.',
      'Taught AI sessions for Sonova and Jacobson Strategic.',
    ],
    links: [{ href: '/speaking', label: 'Speaking' }],
  },
  {
    id: 'series',
    group: 'speak',
    name: 'Masterclass Series',
    price: 10000,
    priceLabel: 'from',
    length: 'Two sessions of up to 3 hours',
    abstract: 'Two connected sessions tailored to your team: from foundations to applied work, as in my delivered programs for HP and Sonova.',
    figures: [],
    proof: [
      'Designed and taught a two-session course at HP: AI Foundations for Digital Innovators, then Applying AI in IT and Digital Solutions.',
      'Taught Sonova’s two-part progression from prompting to AI agents, workflows, and skills.',
    ],
    links: [{ href: '/speaking#hp', label: 'The HP course' }],
  },
];

const retiredServiceIds = new Set(['audit', 'evals', 'series']);
export const services = serviceCatalog.filter(service => !retiredServiceIds.has(service.id));
export const retiredServices = serviceCatalog.filter(service => retiredServiceIds.has(service.id));

export const terms = 'Remote by default. On-site sessions add travel.';

export { teachingPrograms } from './teaching.ts';

export const contactEmail = 'sairambkrishnan@gmail.com';
export const mailto = (subject: string) => `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;
export const money = (n: number) => `$${n.toLocaleString('en-US')}`;
