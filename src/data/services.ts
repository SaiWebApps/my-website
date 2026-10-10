// Sources: Sairam's resume, published SSRN research, Apple & Amazon platform architecture,
// and executive education curricula taught at HP, PBS, Morgan Lewis, and the Philadelphia Eagles.

export type Stage = 'Strategy & ROI' | 'Systems & Scale' | 'Agentic AI & Teams' | 'Masterclasses';
export type Figure = { value: string; label: string };
export type Step = { title: string; text: string };

export interface ServicePackage {
  id: string;
  stage: Exclude<Stage, 'Masterclasses'>;
  name: string;
  tag?: string;
  ask: string;
  askAs?: string;
  problem: string;
  prices: Figure[];
  steps: Step[];
  result: string;
  resultLabel?: string;
  figures: Figure[];
  proof: string[];
  quote?: { text: string; source: string };
  links?: { href: string; label: string; external?: boolean }[];
  offer: { min: number; max: number; unit?: 'MON' };
}

export const stages: Stage[] = ['Strategy & ROI', 'Systems & Scale', 'Agentic AI & Teams', 'Masterclasses'];

export const packages: ServicePackage[] = [
  {
    id: 'payoff',
    stage: 'Strategy & ROI',
    name: 'AI Payoff Review',
    tag: 'Capital allocation & ROI',
    ask: 'Which AI projects will pay off?',
    problem: 'Everyone says we need generative AI. We can’t tell which initiatives deserve funding, how much capital to commit, or how to measure real enterprise payback.',
    prices: [
      { value: '$25,000–$40,000', label: 'fixed fee' },
      { value: '2–3', label: 'weeks' },
    ],
    steps: [
      { title: 'SCALE readiness', text: 'Pre-financial sanity filter: categorize every initiative into Go, No-Go or Not Yet before building complex models.' },
      { title: 'Value-driver tree', text: 'Trace each use case directly to the P&L lines it moves: cost avoidance, cycle-time compression, or net-new revenue.' },
      { title: '8-vector risk discounting', text: 'Calibrate objective discount rates across data quality, model drift, inference unit economics, regulation, vendor dependency, and talent.' },
      { title: 'Stage-gated tranches', text: 'Structure capital releases across proof-of-concept, pilot, and production scale, re-scoring risk at every gate.' },
      { title: 'Executive decision scorecard', text: 'Deliver graded A–F capital allocation recommendations with explicit trigger conditions for executive sign-off.' },
    ],
    result: 'A board-ready decision scorecard for every AI initiative on the table, with stage-gated release criteria for every dollar.',
    figures: [{ value: '8', label: 'public-company AI deployments the framework was applied to, from Salesforce Agentforce and Spotify to JPMorgan COiN' }],
    proof: [
      'Built on the Multi-Layer Framework for Evaluating the Return on Investment of AI Projects (Krishnan, Hepp and Gandhi, SSRN, 2026).',
      'Taught AI strategy and capital allocation to C-suite leaders at HP, PBS, and Morgan Lewis, and keynoted the Eagles Care Summit for the Philadelphia Eagles.',
    ],
    links: [{ href: 'https://doi.org/10.2139/ssrn.6732598', label: 'The framework paper', external: true }],
    offer: { min: 25000, max: 40000 },
  },
  {
    id: 'data',
    stage: 'Strategy & ROI',
    name: 'Data Before AI',
    tag: 'Governance & knowledge graphs',
    ask: 'Our data isn’t ready for AI',
    problem: 'We want an AI that understands our business, but our data sits across disconnected silos, RAG pipelines hallucinate, and sensitive data cannot leak to third-party model providers.',
    prices: [
      { value: '$30,000–$50,000', label: 'fixed fee' },
      { value: '3–4', label: 'weeks' },
    ],
    steps: [
      { title: 'Domain ontology modeling', text: 'Define strict entity schemas and relational models so AI reasons over structured business logic rather than ungrounded text chunks.' },
      { title: 'Zero-leakage governance', text: 'Enforce access controls, PII isolation, and data-boundary rules at the retrieval layer before records ever touch a model context window.' },
      { title: 'Graph vs. flat selection', text: 'Deploy knowledge graphs where relational multi-hop reasoning matters; maintain flat stores where simple semantic search suffices.' },
      { title: 'Entity resolution & deduplication', text: 'Pair semantic similarity with clustering to deduplicate dirty records across disparate enterprise sources.' },
      { title: 'Private & local deployment', text: 'Architect self-hosted and small language model pipelines for sensitive enterprise datasets that cannot leave on-prem infrastructure.' },
    ],
    result: 'A hardened enterprise data model, zero-leakage access boundaries, and an architectural blueprint for your primary AI use case.',
    figures: [
      { value: '15+', label: 'sources unified in Apple’s media knowledge graph' },
      { value: '100M+', label: 'users served daily by that graph' },
      { value: '40%', label: 'gain in data quality from his entity-resolution system' },
    ],
    proof: [
      'Architected the canonical knowledge graph model powering search, recommendations, and discovery for 100M+ users.',
      'Re-architected graph generation from Spark batch jobs onto an event-driven Flink, Kafka, and Cassandra streaming platform.',
      'Delivered executive briefings on Knowledge Graphs and Small Language Models for enterprise leaders at Atos.',
    ],
    offer: { min: 30000, max: 50000 },
  },
  {
    id: 'audit',
    stage: 'Systems & Scale',
    name: 'Architecture & Design Audit',
    tag: 'High-scale systems de-risking',
    ask: 'Is this architecture sound?',
    problem: 'We are about to commit months of engineering to a new distributed architecture—or our existing system is buckling under scale and incident rates are climbing.',
    prices: [
      { value: '$7,500', label: 'single design' },
      { value: '1', label: 'week' },
      { value: '$25,000–$35,000', label: 'full system' },
      { value: '2–3', label: 'weeks' },
    ],
    steps: [
      { title: 'Data models & boundaries', text: 'Validate inputs, outputs, schemas, and strict single-responsibility boundaries across every service boundary.' },
      { title: 'One clean architecture', text: 'Translate sprawling microservice complexity into a single, unambiguous end-to-end system diagram.' },
      { title: 'Cycle & deadlock elimination', text: 'Identify every cyclic dependency, cascading retry loop, and runaway async process, giving each an explicit termination guarantee.' },
      { title: 'Scale & contract rationalization', text: 'Standardize serialization onto unified Protobuf/gRPC contracts and eliminate multi-format translation friction.' },
      { title: 'Batch-to-stream migration', text: 'Identify bottleneck batch processing and architect migration paths to event-driven Kafka and Flink streaming.' },
      { title: 'Deterministic fail-loud contracts', text: 'Ensure AI and async components return exactly one of three typed responses: a validated result, a clarifying query, or a clean refusal.' },
    ],
    result: 'Prioritized risk findings, an architectural remediation blueprint, and a live red-team review session with your senior engineers.',
    figures: [
      { value: '45%', label: 'fewer production incidents under his design-review and CI/CD standards at Apple' },
      { value: '30%', label: 'higher engineering velocity under the same standards' },
      { value: '$40M', label: 'saved annually by the Alexa platform he designed' },
    ],
    proof: [
      'Set the shared Protobuf contracts adopted across Apple’s knowledge graph platform.',
      'Co-designed Drone-Megaddon 2026 with Daniel Ting, establishing fail-loud agent language contracts that mandate validated command sequences, clarifying questions, or explicit refusals.',
    ],
    offer: { min: 7500, max: 35000 },
  },
  {
    id: 'evals',
    stage: 'Systems & Scale',
    name: 'Prove It Works',
    tag: 'Production evals & AI judges',
    ask: 'Is our AI getting better?',
    problem: 'Our AI feature demos well, but users report erratic drift in production. We cannot tell whether this week’s prompt, model, or pipeline change made things better or worse.',
    prices: [
      { value: '$25,000–$40,000', label: 'fixed fee' },
      { value: '2–3', label: 'weeks' },
    ],
    steps: [
      { title: 'Algorithmic scripts first', text: 'Enforce deterministic code checks for everything verifiable (types, schemas, banned strings, latency) before calling an LLM.' },
      { title: 'Curated golden dataset', text: 'Assemble the canonical ground-truth benchmark suite of challenging real-world queries paired with verified human expectations.' },
      { title: 'Evidentiary AI judges', text: 'Design strict Pass/Fail judge harnesses that mandate verbatim citation of transcript evidence, rejecting vague vibes.' },
      { title: 'Overturn tracking & calibration', text: 'Instrument telemetry to track human-overturned verdicts, automatically flagging and retiring drifting judges.' },
      { title: 'Automated CI regression gates', text: 'Embed evaluation runs into your deployment pipeline so no prompt or agent updates ship without passing score thresholds.' },
    ],
    result: 'An automated evaluation harness integrated into CI that proves in hard numbers whether your AI improved before it touches users.',
    figures: [],
    proof: [
      'Wrote Ondoway’s tour-quality rubric and tests that each fail if the check they name is deleted, plus golden tests scoring tours against human-curated benchmarks.',
      'Built Persuaider’s AI judge, which analyzes full negotiation transcripts and scores multi-framework strategic moves.',
      'Engineered the Peeraxis evidentiary judge architecture: strict Pass/Fail verification backed by quoted transcript evidence, with overturn telemetry to retire drifting judges.',
    ],
    links: [{ href: '/projects#ondoway', label: 'Ondoway' }, { href: '/projects#persuaider', label: 'Persuaider' }],
    offer: { min: 25000, max: 40000 },
  },
  {
    id: 'agents',
    stage: 'Agentic AI & Teams',
    name: 'Grow It Like a Tree',
    tag: '30 days to coding agents that work',
    ask: 'Our coding agents make a mess',
    askAs: 'the 30-day rollout',
    problem: 'We ship more code than ever with AI assistants, but incidents are up, review backlogs are crushing seniors, and ungrounded code is compounding technical debt.',
    prices: [
      { value: '$35,000–$50,000', label: 'per team' },
      { value: '30', label: 'days' },
    ],
    steps: [
      { title: 'Week 1 · Failure mapping', text: 'Map the codebase and isolate where AI-generated errors and regression clusters are concentrating.' },
      { title: 'Week 2 · Codebase grounding', text: 'Ground agents in source reality: connect a code graph, enforce whole-file context reading, ban hallucinated snippets, lock down environment scripts, and configure adversarial guardrails (Crucible).' },
      { title: 'Week 3 · The single-anchor use case', text: 'Anchor the workflow to one critical operational capability (such as on-call trace and log triage) until it succeeds 100% of the time.' },
      { title: 'Week 4 · Verification loop', text: 'Establish the self-healing error database (LEARNINGS loop). Realign engineering incentives from lines generated to 30-day verification survival.' },
    ],
    result: 'An incident blast-radius map, grounded agent tooling that works reliably every time, and an engineering team trained on verification hygiene.',
    figures: [],
    proof: [
      'Built and shipped the production LLM ops assistant his Apple team uses daily to debug logs, metrics, and traces over MCP.',
      'Created DependIQ (mapping dependency blast-radii across repo graphs) and Crucible (adversarial QA and safety hooks for coding agents).',
    ],
    quote: { text: 'The scarce resource is no longer the capacity to produce code. It is the capacity to verify it.', source: 'Krishnan and Thokala, Who Trains the Next Senior? (SSRN, 2026)' },
    offer: { min: 35000, max: 50000 },
  },
  {
    id: 'office-hours',
    stage: 'Agentic AI & Teams',
    name: 'Fractional Principal Architect',
    tag: 'Executive advisory & office hours',
    ask: 'We need a principal architect on call',
    problem: 'We don’t need a $600k+ full-time Principal Engineer. We need seasoned architectural judgment on call when distributed systems, data models, or AI designs get hard.',
    prices: [
      { value: '$5,000', label: 'a month · Strategic Advisory' },
      { value: '$9,500', label: 'a month · Fractional Principal' },
      { value: '3', label: 'month commitment' },
    ],
    steps: [
      { title: 'Architecture design gate', text: 'Rigorous pre-commit review of design docs and system specs before engineering commits months of implementation.' },
      { title: 'Standing office hours', text: 'Dedicated weekly slots for senior engineers to debug distributed bottlenecks, agent harnesses, and data modeling challenges.' },
      { title: 'Spiking & prototyping', text: 'Direct technical sparring to co-design and unblock the first version of complex, high-consequence components.' },
      { title: 'Staff engineer acceleration', text: 'Targeted 1-on-1 mentorship to elevate high-potential senior engineers into staff- and principal-caliber leaders.' },
    ],
    result: 'Strictly capped at two concurrent client retainers to guarantee direct, high-leverage principal attention.',
    resultLabel: 'Terms',
    figures: [],
    proof: [
      'Mentored half his Amazon team from entry level to promotion, earning selection for Amazon’s Mentorship and Leadership Development Program.',
      'Mentors Apple engineers to promotion and sets the design-review standards that cut production incidents by 45%.',
    ],
    offer: { min: 5000, max: 9500, unit: 'MON' },
  },
];

export const workshops = {
  ask: 'Our teams need to learn this',
  prices: [
    { value: '$5,000', label: 'half day intensive' },
    { value: '$9,500', label: 'full day deep dive' },
  ] as Figure[],
  keynote: 'Executive keynotes are quoted per event.',
  executive: [
    { title: 'AI ROI & Capital Allocation: The Multi-Layer Framework', org: 'Wharton Research' },
    { title: 'AI Adoption: From Resistance to Persuasion', org: 'Morgan Lewis' },
    { title: 'Data Privacy, Governance & Security First', org: 'PBS' },
    { title: 'AI Foundations for Digital Innovators', org: 'HP' },
    { title: 'Applying AI in IT and Digital Solutions', org: 'HP' },
    { title: 'AI for Impact: Intelligent Systems for Civic Good', org: 'Philadelphia Eagles' },
  ],
  engineering: [
    { title: 'Who Trains the Next Senior? Engineering When Code Is Cheap', org: 'Research Working Paper' },
    { title: 'Production Evals & Evidentiary AI Judges', org: 'Hands-On Lab' },
    { title: 'Architecting Agent Harnesses with MCP & Code Graphs', org: 'Production Architecture' },
    { title: 'Knowledge Graphs Before Small Language Models', org: 'Atos' },
    { title: 'Event-Driven Architectures: From Batch to Real-Time Streaming', org: 'Apple & Amazon Scale' },
    { title: 'Software Contracts & Fail-Loud Protocols for Autonomous Agents', org: 'Engineering Lab' },
  ],
};

export const contactEmail = 'sairambkrishnan@gmail.com';
export const mailto = (subject: string) => `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;
