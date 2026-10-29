// Sources: public/assets/Sairam_Krishnan_Resume.pdf (Apple onward, Wharton, degrees, publications)
// the legacy engineering resume (AWS, LeanFM, CMU teaching, NSF research, Hand-2048 capstone, Drone-Megaddon),
// Sairam's own account of the AWS logging-schema and tracer work, the 18-549 team site, poster, and his RasPi setup guide,
// and his Web Apps course-planning docs, exercise set, and reference apps (Google Drive, CMU/Web Apps Exercises).
// Apple, Amazon, Praxtera: user-approved résumé sections and leadership-investigation.md, 26 October 2026.

export const eaglesSummitSources = [
  { label: 'Eagles Care Summit archive', href: 'https://web.archive.org/web/20260315052929/https://www.philadelphiaeagles.com/community/caresummit/' },
  { label: 'Philadelphia Eagles post', href: 'https://www.linkedin.com/posts/philadelphia-eagles_flyeaglesfly-activity-7442306553736650753-JEDu' },
  { label: 'Michelle Histand’s post', href: 'https://www.linkedin.com/posts/michelle-histand-9486308_yesterday-i-got-to-teach-ai-to-over-150-non-profit-activity-7440565809158115328-g9ug' },
];

export type CareerEntry = {
  id: string;
  label: string;
  org: string;
  role: string;
  dates: string;
  meta?: string;
  kind: 'work' | 'school' | 'aspect';
  parent?: string;
  verb?: string;
  time: number;
  bullets: string[];
  links?: { href: string; label: string }[];
  figures?: { img: string; href: string; title: string; detail?: string; date: string; alt: string; width: number; height: number }[];
};

export const careerLedger: CareerEntry[] = [
  { id: 'cmu', label: 'Carnegie Mellon', org: 'Carnegie Mellon University', role: 'M.S. and B.S. in Electrical & Computer Engineering', dates: '2010 – Dec 2014', meta: 'Pittsburgh, PA', kind: 'school', time: 0.1, bullets: [
    'Earned an M.S. in Electrical & Computer Engineering, GPA 4.00/4.00 · Dec 2014.',
    'Earned a B.S. in Electrical & Computer Engineering with a minor in Business Administration · May 2014.',
    "Made the Dean's List, Carnegie Institute of Technology · 2012, 2013, 2014.",
  ]},
  { id: 'cmu-research', label: 'NSF Research', org: 'Carnegie Mellon University', role: 'NSF Cyberphysical Systems Researcher', dates: 'Feb 2013 – Aug 2013', kind: 'aspect', parent: 'cmu', verb: 'researched', time: 0.16, bullets: [
    'Designed a bacterial simulator to replace live culture experiments.',
  ]},
  { id: 'cmu-teaching', label: 'Teaching', org: 'Carnegie Mellon University', role: 'Web Applications Course Developer · Teaching Assistant', dates: 'May 2013 – Dec 2013', kind: 'aspect', parent: 'cmu', verb: 'taught', time: 0.19, bullets: [
    'Created a cloud platform for course administration.',
    'Instructed 105+ students as Agile Product Owner for their final projects.',
    'Redesigned the Web Applications course with the professor, planning a 20-lecture semester from client-side code and HTTP through relational and NoSQL databases, servlets, security, and Django, plus a follow-on Web Application Frameworks course.',
    'Built the client-side exercise set: HTML5, CSS3, and JavaScript demos, from form validation and a calculator to single-player Pong and an image gallery, each with extension exercises.',
    'Designed server-side exercises on sessions, cookies, and relational databases, an HTML-injection exercise on Django template escaping, and a deliberately flawed Django app for students to expose by writing tests.',
    'Built reference survey apps in Spring MVC, Play, and Django, taking the Spring version through six releases on Google App Engine with image upload, AJAX editing, and survey recommendations.',
  ], links: [{ href: '/speaking#cmu', label: 'Speaking' }] },
  { id: 'leanfm', label: 'LeanFM', org: 'LeanFM Technologies', role: 'Full-Stack Web Developer Intern', dates: 'Dec 2013 – Feb 2014', kind: 'work', parent: 'cmu', verb: 'interned', time: 0.22, bullets: [
    'Developed a Django admin interface for building managers.',
  ]},
  { id: 'cmu-capstone', label: 'Hand-2048', org: 'Carnegie Mellon University', role: 'Embedded Capstone (18-549) · Hand-2048', dates: 'Spring 2014', kind: 'aspect', parent: 'cmu', verb: 'built', time: 0.24, bullets: [
    'Reconfigured the hit game 2048 to take hand motions as input, using a Raspberry Pi and an Asus Xtion Pro motion sensor in a motion-sensing-and-actuating framework.',
    "Wrote the team's Raspberry Pi setup guide for headless SSH access from a laptop and for building the OpenNI 2 samples on the Pi.",
    'Switched gesture tracking from an open palm to a closed fist after the Xtion Pro picked up other parts of the body, turning an unsteady position reading into a stable one.',
  ], links: [
    { href: 'https://course.ece.cmu.edu/~ece549/spring14/team5/index.html', label: 'Project site' },
    { href: 'https://course.ece.cmu.edu/~ece549/spring14/team5/presentations/TestingPresentation.pdf', label: 'Testing presentation' },
  ], figures: [
    { img: '/projects/hand-2048-poster.jpg', href: '/projects/hand-2048-poster.jpg', title: 'Hand-2048: 2048 Game Using Hand Motions', detail: '18-549 Embedded Systems Design', date: 'Spring 2014', alt: 'Hand-2048 poster: motivation, requirements, architecture from Asus Xtion Pro through Raspberry Pi to projector, and hand-tracking results', width: 1344, height: 1696 },
  ] },
  { id: 'aws', label: 'AWS', org: 'Amazon Web Services (AWS)', role: 'SDE Intern', dates: 'May 2014 – Aug 2014', kind: 'work', parent: 'cmu', verb: 'interned', time: 0.26, bullets: [
    "Unified the logging system: designed a single common schema for every team's log messages, convinced the teams to adopt it, and consolidated their custom loggers under one shared framework.",
    'Built a log tracer on that framework that traced API calls end to end, pinpointing where in the flow a request failed and what the failure was.',
    'Sped up the logging system 15% for 8M+ customers.',
  ]},
  { id: 'cmu-projects', label: 'Drone-Megaddon', org: 'Carnegie Mellon University', role: 'Projects · Drone-Megaddon', dates: 'Fall 2014', kind: 'aspect', parent: 'cmu', verb: 'built', time: 0.29, bullets: [
    'Built an end-to-end Android, radio, and embedded-control prototype for commanding drones through a StarCraft-like real-time strategy interface.',
    'Krishnan, S., & Ting, D. (2014). Drone-Megaddon: A Real-Time Strategy Interface for Managing Drone Swarms. engrXiv (archived 2026).',
    'Extended that work in Drone-Megaddon 2026, a proposed architecture connecting language-based intent, visual grounding and tracking, and multi-drone coordination under latency, bandwidth, and human-oversight constraints.',
  ], links: [{ href: 'https://doi.org/10.31224/6924', label: 'doi:10.31224/6924' }, { href: 'https://doi.org/10.31224/6987', label: 'doi:10.31224/6987' }] },
  { id: 'microsoft', label: 'Microsoft', org: 'Microsoft', role: 'Software Development Engineer', dates: 'Mar 2015 – Oct 2016', meta: 'Redmond, WA', kind: 'work', parent: 'cmu', verb: 'joined', time: 0.42, bullets: [
    "Cut Windows 10 Mobile Mail power consumption 4x against the Windows Phone 8 baseline, and set the app's power targets.",
    'Drove product decisions with telemetry: real-time dashboards, weekly guidance to leadership, and the data-derived default for the auto-sync interval.',
  ]},
  { id: 'sig', label: 'SIG', org: 'Susquehanna International Group (SIG)', role: 'Senior Financial Data Engineer', dates: 'Nov 2016 – Mar 2018', meta: 'Philadelphia, PA · Promoted from Financial Data Engineer', kind: 'work', parent: 'microsoft', verb: 'joined', time: 0.55, bullets: [
    "Led real-time FINRA compliance surveillance across the firm's market-making transactions in C++, Python/Pandas, and Django, flagging violations at the moment of execution.",
    'Designed and shipped a real-time hardware asset-tracking system that automated capacity scaling and ended chronic inter-team coordination failures.',
  ]},
  { id: 'amazon', label: 'Amazon Alexa', org: 'Amazon', role: 'Senior Software Engineer, Alexa', dates: 'Apr 2018 – Feb 2021', meta: 'Seattle, WA · Promoted from SDE II (L5) to Senior SDE (L6)', kind: 'work', parent: 'sig', verb: 'joined', time: 0.68, bullets: [
    'Led an eight-engineer Alexa team, owning performance reviews, hiring, recurring 1:1s, and promotion recommendations.',
    'Designed a GraphQL aggregation and orchestration platform that saved $40M annually, combining an annotation-driven rule engine, batched downstream results, common-query prefetching, and cache keys matched to each skill’s semantics.',
    "Mentored half the team from entry level to promotion, earning selection for Amazon's Mentorship and Leadership Development Program.",
    'Collapsed partner onboarding from two weeks to 15 minutes with a self-service rapid-deployment platform.',
    'Owned operational excellence, driving the weekly issue count from 40 to 10 and re-engineering the new-user registration flow to cut peak-holiday customer issues tenfold.',
    "Led capacity planning for Prime Day and Black Friday, forecasting hardware demand and winning leadership's commitment to expand the fleet ahead of peak.",
    'Improved end-to-end ASR and routing accuracy 40%, measured before and after changes to the Alexa Orchestration Engine Router. Combined skill-aware prefetching, early request processing, and downstream context fed back into speech recognition and hypothesis selection.',
    'Mapped compound spoken requests to multiple skills and queries, preserved their associations, and fed recurring intent relationships back into recognition. Moved skill-specific logic closer to ASR through FreeMarker templates, Python scripts, and lightweight Lambda functions.',
  ]},
  { id: 'apple', label: 'Apple', org: 'Apple', role: 'Principal Software Engineer · Team Lead since 2022', dates: 'Feb 2021 – Present', meta: 'Seattle, WA', kind: 'work', parent: 'amazon', verb: 'joined', time: 0.82, bullets: [
    'Lead and develop eight engineers, including five senior engineers, across Seattle, London, and international partner teams. Own performance reviews and review conversations, assign or recommend ratings, participate in calibration, and drive hiring and promotion mentoring.',
    'Lead architecture, AI/ML engineering, and delivery for Apple’s media intelligence platform, integrating 15+ sources to support search, recommendations, and discovery reaching 100M+ users.',
    'Developed a senior engineer into independent ownership of migration performance engineering through prototype-driven decisions and stakeholder alignment; the engineer went on to lead load testing and optimization across workloads from 1M to 100M messages.',
    'Built Crucible, an agent engineering framework used in daily operations and adopted by QA, Operations, and upstream/downstream teams. Combined MCP tools, multiagent review, model-based action checks, and executable acceptance rules; partner teams extended it into end-to-end test generation and cross-service diagnosis.',
    'Led the Apple Music Credits launch across a 15-engineer, four-office program, delivering real-time credits curation for millions of tracks. Built graph and curation infrastructure supporting Apple Music Credits and Apple Music Classical.',
    'Drove the production migration from Spark batch processing to Flink, Kafka, and Cassandra streaming, reducing average processing time from approximately 60 hours to one minute. Built the end-to-end curation pipeline for partial and complete edits to entities, relationships, and properties.',
    'Led foundational development of supervised ML entity resolution, improving data quality 40%. Partnered with ML engineers on candidate generation, features, human labels, prediction overrides, evaluation, and canonical identity integration using logistic regression, random forests, and gradient-boosted trees.',
    'Established design-review and CI/CD standards that increased team velocity 30% and reduced production incidents 45%. Own graph query services, the partner client library, and shared Protobuf contracts adopted across the platform.',
    'Architected and delivered a GraphRAG evaluation and correction workflow for Gemini and internal foundation models across music, books, and podcasts. Verify generated entities and relationships against canonical facts, identify precise discrepancies, and feed structured corrections into subsequent model queries, with separate checks for contradictions in the graph.',
    'Own architecture and hands-on engineering for ML tagging and awards workflows, directing a senior and junior engineer while implementing difficult candidate matching and canonical entity generation. Design versioned prediction metadata and persistent human overrides, and lead client-team integration.',
    'Secured agreement from Operations, PMs, and client teams to sequence Sticky Credits behind an underway streaming migration, then delivered the production port in one sprint, consolidating duplicated batch, real-time, and curation logic into one flow.',
  ]},
  { id: 'wharton', label: 'Wharton', org: 'The Wharton School, University of Pennsylvania', role: 'Executive MBA, WEMBA Class of 2026', dates: 'May 2024 – May 2026', kind: 'school', parent: 'apple', verb: 'attended', time: 0.9, bullets: [
    'Earned Palmer Scholar honors (top 5% of class).',
    'Won the Benjamin Franklin Award (peer-voted; one of three recipients in a class of 250).',
    "Made the Director's List in all six terms.",
    'Earned First Year Honors.',
    'Completed five majors: AI in Business · Strategic Management · Operations, Information & Decision-Making · Entrepreneurship & Innovation · Business Analytics.',
  ], figures: [
    { img: '/letters/first-year-honors.png', href: '/letters/first-year-honors.pdf', title: 'First Year Honors', date: 'June 13, 2025', alt: 'First Year Honors letter from the Wharton MBA Program for Executives, June 13, 2025', width: 1224, height: 1130 },
    { img: '/letters/directors-list-summer-2024.png', href: '/letters/directors-list-summer-2024.pdf', title: "Director's List", detail: 'Summer 2024', date: 'October 17, 2024', alt: "Director's List letter for Summer 2024 from the Wharton MBA Program for Executives, October 17, 2024", width: 1224, height: 1130 },
    { img: '/letters/directors-list-fall-2024.png', href: '/letters/directors-list-fall-2024.pdf', title: "Director's List", detail: 'Fall 2024', date: 'February 4, 2025', alt: "Director's List letter for Fall 2024 from the Wharton MBA Program for Executives, February 4, 2025", width: 1224, height: 1130 },
    { img: '/letters/directors-list-spring-2025.png', href: '/letters/directors-list-spring-2025.pdf', title: "Director's List", detail: 'Spring 2025', date: 'June 13, 2025', alt: "Director's List letter for Spring 2025 from the Wharton MBA Program for Executives, June 13, 2025", width: 1224, height: 1130 },
  ]},
  { id: 'praxtera', label: 'Praxtera', org: 'Praxtera AI Institute', role: 'Head of AI & Executive Education', dates: 'Sep 2025 – Present', meta: 'Philadelphia-based AI executive-education firm · concurrent with the Apple role', kind: 'work', parent: 'wharton', verb: 'joined', time: 1, bullets: [
    'Own AI curriculum strategy and development as Praxtera’s principal AI subject-matter expert and lead speaker, translating production AI/ML leadership and original Wharton research into programs for HP, Morgan Lewis, PBS, and Sonova.',
    "Keynoted the Philadelphia Eagles' 12th annual Eagles Care Summit on March 18, 2026, delivering \"AI for Impact\" to more than 300 community and business leaders.",
    'Enabled HP teams to expand Copilot use into reusable workflows and skills for recurring tasks, progressing from LLM foundations to retrieval, knowledge graphs, and workflow versus agent architecture through hands-on labs.',
    'Built Sonova’s beginner-to-advanced AI learning progression, with practical evaluation of budget-analysis workflows: verify formulas, test edge cases, challenge invented explanations, and turn corrections into reusable rules.',
    'Trained Morgan Lewis’s internal trainers and champions to help initially resistant lawyers adopt AI, turning real objections into AI-assisted personas, live roleplay, and reusable enablement toolkits.',
    'Lead client discovery, technical advisory sessions, and office hours; design AI solution architectures for contractor implementation and help teams decide what to automate and when agent coordination is warranted.',
  ], links: [{ href: '/speaking#eagles', label: 'Speaking' }, ...eaglesSummitSources] },
];

export const careerById = Object.fromEntries(careerLedger.map(entry => [entry.id, entry])) as Record<string, CareerEntry>;

export const leadershipHubs = ['People', 'Systems', 'Decisions'] as const;
export type LeadershipHub = typeof leadershipHubs[number];

export const leadershipSpokes = [
  { id: 'apple', label: 'Apple' },
  { id: 'amazon', label: 'Amazon Alexa' },
  { id: 'praxtera', label: 'Praxtera' },
  { id: 'cmu', label: 'Carnegie Mellon' },
  { id: 'microsoft-sig', label: 'Microsoft · SIG' },
] as const;

// Each item quotes a career bullet by index so the leadership view never diverges from the record.
const leadershipRefs: { spoke: typeof leadershipSpokes[number]['id']; hub: LeadershipHub; entry: string; bullet: number; links?: { href: string; label: string }[] }[] = [
  { spoke: 'apple', hub: 'People', entry: 'apple', bullet: 0 },
  { spoke: 'apple', hub: 'People', entry: 'apple', bullet: 2 },
  { spoke: 'apple', hub: 'People', entry: 'apple', bullet: 4 },
  { spoke: 'apple', hub: 'Systems', entry: 'apple', bullet: 1 },
  { spoke: 'apple', hub: 'Systems', entry: 'apple', bullet: 5 },
  { spoke: 'apple', hub: 'Systems', entry: 'apple', bullet: 8 },
  { spoke: 'apple', hub: 'Systems', entry: 'apple', bullet: 3 },
  { spoke: 'apple', hub: 'Decisions', entry: 'apple', bullet: 7 },
  { spoke: 'apple', hub: 'Decisions', entry: 'apple', bullet: 10 },
  { spoke: 'amazon', hub: 'People', entry: 'amazon', bullet: 0 },
  { spoke: 'amazon', hub: 'People', entry: 'amazon', bullet: 2 },
  { spoke: 'amazon', hub: 'Systems', entry: 'amazon', bullet: 4 },
  { spoke: 'amazon', hub: 'Systems', entry: 'amazon', bullet: 6 },
  { spoke: 'amazon', hub: 'Decisions', entry: 'amazon', bullet: 5 },
  { spoke: 'praxtera', hub: 'People', entry: 'praxtera', bullet: 1, links: eaglesSummitSources },
  { spoke: 'praxtera', hub: 'Decisions', entry: 'praxtera', bullet: 0 },
  { spoke: 'cmu', hub: 'People', entry: 'cmu-teaching', bullet: 1 },
  { spoke: 'cmu', hub: 'Systems', entry: 'cmu-teaching', bullet: 0 },
  { spoke: 'cmu', hub: 'Decisions', entry: 'cmu-teaching', bullet: 2 },
  { spoke: 'microsoft-sig', hub: 'Decisions', entry: 'microsoft', bullet: 1 },
  { spoke: 'microsoft-sig', hub: 'Decisions', entry: 'microsoft', bullet: 0 },
  { spoke: 'microsoft-sig', hub: 'Systems', entry: 'sig', bullet: 0 },
];

export const leadershipItems = leadershipRefs.map(ref => {
  const entry = careerById[ref.entry];
  const text = entry?.bullets[ref.bullet];
  if (!text) throw new Error(`Missing leadership source ${ref.entry}[${ref.bullet}]`);
  return { spoke: ref.spoke, hub: ref.hub, org: entry.org, dates: entry.dates, text, links: ref.links ?? [] };
});
