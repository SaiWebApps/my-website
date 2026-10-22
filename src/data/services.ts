// Sources: src/data/career.ts, src/data/content.ts, src/data/speaking.ts.
// Prices: sourced 2024–2026 US market rates and amounts clients paid for past sessions (kept off the site).

export type Figure = { value: string; label: string };

export interface Service {
  id: string;
  name: string;
  price: number;
  unit?: 'MON';
  priceLabel: string;
  length: string;
  abstract: string;
  figures: Figure[];
  proof: string[];
  links?: { href: string; label: string; external?: boolean }[];
}

export const services: Service[] = [
  {
    id: 'call',
    name: 'Architecture Call',
    price: 500,
    priceLabel: 'from',
    length: '60 minutes',
    abstract: 'One hour on the design, scaling problem, data model, or AI build your team is stuck on. Bring the doc or the diagram; leave with a recommendation.',
    figures: [
      { value: '100M+', label: 'users on Apple’s media knowledge graph' },
      { value: '15+', label: 'sources unified into one canonical model' },
    ],
    proof: ['Led architecture and cross-functional delivery of Apple’s media knowledge graph, the canonical model unifying 15+ sources to power search, recommendations, and discovery for over 100 million users.'],
  },
  {
    id: 'review',
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
    id: 'retainer',
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
      'Mentored Apple engineers to promotion, shaped performance reviews, and drove hiring.',
      'Published “Who Trains the Next Senior? Managing Software Engineering When AI Makes Code Cheap” as first author (SSRN, 2026).',
    ],
    links: [{ href: '/research#who-trains-the-next-senior', label: 'The management paper' }],
  },
  {
    id: 'masterclass',
    name: 'Masterclass',
    price: 10000,
    priceLabel: 'from',
    length: '2–4 hours',
    abstract: 'One session from the catalog below, fitted to your firm, for your executives or engineers. I taught AI strategy to C-suite leaders at HP, Morgan Lewis, PBS, and the Philadelphia Eagles.',
    figures: [],
    proof: ['Designed Praxtera’s executive AI curriculum, built on original Wharton research to help executives evaluate, govern, and deploy AI.'],
    links: [{ href: '/speaking', label: 'Speaking' }],
  },
  {
    id: 'keynote',
    name: 'Keynote',
    price: 10000,
    priceLabel: 'from, plus travel',
    length: 'One talk',
    abstract: 'A keynote on any topic in the catalog below, for a conference, summit, or company offsite.',
    figures: [{ value: '300+', label: 'community and business leaders at the Eagles Care Summit' }],
    proof: [
      'Keynoted the Philadelphia Eagles’ 12th annual Eagles Care Summit at Lincoln Financial Field on March 18, 2026, delivering “AI for Impact” to more than 300 community and business leaders.',
      'Presented “Knowledge Graphs, Then Small Language Models” to Atos on September 3, 2026, with a live setup of a local model in five minutes.',
    ],
    links: [{ href: '/speaking#eagles', label: 'The Eagles keynote' }, { href: '/speaking', label: 'Speaking' }, { href: '/talks/knowledge-graphs', label: 'The Atos deck' }],
  },
  {
    id: 'audit',
    name: 'Architecture Audit',
    price: 15000,
    priceLabel: 'from',
    length: '2–3 weeks',
    abstract: 'A review of a whole system, not one doc: every service boundary, data contract, and dependency, and the bottlenecks, failure loops, and batch jobs that should be streams. Ends with a ranked remediation plan and a working session with your senior engineers.',
    figures: [
      { value: '$40M', label: 'saved a year on the Alexa Engine' },
      { value: '40%', label: 'higher model accuracy on the Alexa Engine' },
    ],
    proof: [
      'Designed the GraphQL data-aggregation and caching platform for the Alexa Engine, saving $40M a year and lifting model accuracy 40%.',
      'Drove Apple’s knowledge graph platform from batch to real-time streaming, re-architecting ingestion, similarity mapping, and graph generation from Spark onto Flink, Kafka, and Cassandra.',
      'Designed Apple’s ML entity-resolution system, lifting data quality 40% while cutting downstream cost.',
      'Owned Alexa operational excellence, driving the weekly issue count from 40 to 10 and re-engineering the new-user registration flow to cut peak-holiday customer issues tenfold.',
      'Led Alexa capacity planning for Prime Day and Black Friday, forecasting hardware demand and winning leadership’s commitment to expand the fleet ahead of peak.',
    ],
  },
  {
    id: 'roi',
    name: 'AI ROI Review',
    price: 15000,
    priceLabel: 'from',
    length: '2–3 weeks',
    abstract: 'I run every AI initiative on your list through the four-layer framework from my SSRN paper: a SCALE strategic readiness assessment of your firm, a value driver tree that traces each initiative to return on invested capital, a discount rate adjusted for AI-specific risks such as vendor and platform dependency and organizational friction, and stage gates that release each tranche of funding only on evidence. You get a decision scorecard that tells your executives which initiatives to fund.',
    figures: [{ value: '8', label: 'deployments in the validation set, from Salesforce Agentforce to JPMorgan COiN' }],
    proof: [
      'Published “A Multi-Layer Framework for Evaluating the Return on Investment of AI Projects” as first author (SSRN, 2026).',
      'Taught PBS leaders first steps toward AI ROI, starting from the pain points that take employees’ time away from the mission.',
    ],
    links: [{ href: 'https://doi.org/10.2139/ssrn.6732598', label: 'The framework paper', external: true }],
  },
  {
    id: 'series',
    name: 'Masterclass Series',
    price: 15000,
    priceLabel: 'from',
    length: 'Two sessions',
    abstract: 'Two sessions from the catalog below, built as a sequence, like the two-part course I designed and taught at HP.',
    figures: [],
    proof: ['Designed and taught a two-session course at HP: AI Foundations for Digital Innovators, then Applying AI in IT and Digital Solutions.'],
    links: [{ href: '/speaking#hp', label: 'The HP course' }],
  },
  {
    id: 'evals',
    name: 'Evals Harness',
    price: 20000,
    priceLabel: 'from',
    length: '3–4 weeks',
    abstract: 'A test suite that shows whether a prompt, model, or pipeline change made your AI better or worse: deterministic checks first, a golden set of real queries with expected answers, and model-graded judges where code cannot check. It runs on every code change, so no change ships without passing.',
    figures: [{ value: '200+', label: 'tests in the Lore / DependIQ suite' }],
    proof: [
      'Built and shipped production agentic AI at Apple: an LLM ops assistant for debugging logs, traces, and metrics over MCP in natural language, and a skill platform that turned pipeline work into plain-English workflows for daily, on-call use.',
      'Presented to Atos how a knowledge graph enriches questions before they reach a model and checks the model’s answer afterward.',
      'Built Persuaider end to end: in-character AI personas, framework-based evaluation, and a deep automated test suite.',
      'Built Crucible, which holds coding agents to deterministic gates and adversarial evidence checks.',
      'Designed Lore / DependIQ, a multi-tenant product with more than 200 tests.',
    ],
    links: [{ href: '/projects#persuaider', label: 'Persuaider' }, { href: '/projects#crucible', label: 'Crucible' }, { href: '/projects#lore', label: 'Lore / DependIQ' }, { href: '/talks/knowledge-graphs', label: 'The Atos deck' }],
  },
];

export const terms = 'Remote by default. On-site sessions add travel.';

export const masterclasses = [
  { title: 'AI Foundations for Digital Innovators', org: 'HP', abstract: 'How large language models work and where they fail, from bias to hallucination; choosing among ChatGPT, Gemini, Claude, Copilot, Perplexity, and NotebookLM; the H4W and COSTAR prompt frameworks; and AI across the software development lifecycle.' },
  { title: 'Applying AI in IT and Digital Solutions', org: 'HP', abstract: 'Retrieval-augmented generation, vector databases, and knowledge graphs; custom GPTs; the difference between AI workflows and agents, and a checklist for when an agent is worth building; and AI governance.' },
  { title: 'AI Adoption and Change Management', org: 'Morgan Lewis', abstract: 'Why adoption fails, diagnosed with the innovation adoption curve, Deloitte Business Chemistry, and the MAPPR model, then a live roleplay turning resisters into adopters with the CLEAR framework and a champion’s toolkit for the firm.' },
  { title: 'AI Strategy, Governance First', org: 'PBS', abstract: 'What generative AI is and isn’t; privacy and governance frameworks as the first step; and a path to AI ROI that starts from the pain points taking people away from the mission.' },
  { title: 'AI for Impact', org: 'Philadelphia Eagles', abstract: 'The keynote I delivered to more than 300 community and business leaders at the 12th annual Eagles Care Summit.' },
  { title: 'Knowledge Graphs, Then Small Language Models', org: 'Atos', abstract: 'How a knowledge graph enriches questions before they reach a model and checks the answer afterward, then when to go small with language models, with a live setup of a local model in five minutes.', href: '/talks/knowledge-graphs' },
  { title: 'Which AI Projects Will Pay Off?', org: 'SSRN, 2026', abstract: 'More than 80 percent of AI projects fail to deliver measurable returns. A four-layer method for deciding which initiatives to fund, validated against eight deployments including Salesforce Agentforce, Spotify, and JPMorgan COiN.', href: 'https://doi.org/10.2139/ssrn.6732598' },
  { title: 'Who Trains the Next Senior?', org: 'SSRN, 2026', abstract: 'Managing software engineering when AI makes code cheap: shrink the unit of review, tier scrutiny by consequence, measure verified outcomes rather than raw output, and rebuild the apprenticeship on purpose.', href: 'https://doi.org/10.2139/ssrn.7083078' },
];

export const contactEmail = 'sairambkrishnan@gmail.com';
export const mailto = (subject: string) => `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;
export const money = (n: number) => `$${n.toLocaleString('en-US')}`;
