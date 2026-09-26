// Sources: public/assets/Sairam_Krishnan_Resume.pdf (Apple onward, Wharton, degrees, publications)
// the legacy engineering resume (AWS, LeanFM, CMU teaching, NSF research, Hand-2048 capstone, Drone-Megaddon),
// Sairam's own account of the AWS logging-schema and tracer work, the 18-549 team site, poster, and his RasPi setup guide,
// and his Web Apps course-planning docs, exercise set, and reference apps (Google Drive, CMU/Web Apps Exercises).

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
    'M.S. in Electrical & Computer Engineering, GPA 4.00/4.00 · Dec 2014',
    'B.S. in Electrical & Computer Engineering; Minor in Business Administration · May 2014',
    "Dean's List, Carnegie Institute of Technology · 2012, 2013, 2014",
  ]},
  { id: 'cmu-research', label: 'NSF Research', org: 'Carnegie Mellon University', role: 'NSF Cyberphysical Systems Researcher', dates: 'Feb 2013 – Aug 2013', kind: 'aspect', parent: 'cmu', verb: 'researched', time: 0.16, bullets: [
    'Designed bacterial simulator to replace live culture experiments.',
  ]},
  { id: 'cmu-teaching', label: 'Teaching', org: 'Carnegie Mellon University', role: 'Web Applications Course Developer · Teaching Assistant', dates: 'May 2013 – Dec 2013', kind: 'aspect', parent: 'cmu', verb: 'taught', time: 0.19, bullets: [
    'Created cloud platform for course administration.',
    "Instructed 105+ students as final projects' Agile Product Owner.",
    'Redesigned the Web Applications course with the professor, planning a 20-lecture semester from client-side code and HTTP through relational and NoSQL databases, servlets, security, and Django, plus a follow-on Web Application Frameworks course.',
    'Built the client-side exercise set: HTML5, CSS3, and JavaScript demos, from form validation and a calculator to single-player Pong and an image gallery, each with extension exercises.',
    'Designed server-side exercises on sessions, cookies, and relational databases, an HTML-injection exercise on Django template escaping, and a deliberately flawed Django app for students to expose by writing tests.',
    'Built reference survey apps in Spring MVC, Play, and Django, taking the Spring version through six releases on Google App Engine with image upload, AJAX editing, and survey recommendations.',
  ]},
  { id: 'leanfm', label: 'LeanFM', org: 'LeanFM Technologies', role: 'Full-Stack Web Developer Intern', dates: 'Dec 2013 – Feb 2014', kind: 'work', parent: 'cmu', verb: 'interned', time: 0.22, bullets: [
    'Developed Django admin interface for building managers.',
  ]},
  { id: 'cmu-capstone', label: 'Hand-2048', org: 'Carnegie Mellon University', role: 'Embedded Capstone (18-549) · Hand-2048', dates: 'Spring 2014', kind: 'aspect', parent: 'cmu', verb: 'built', time: 0.24, bullets: [
    'Reconfigured hit game 2048 to use hand-motions as inputs; utilized Raspberry Pi and Asus-Xtion-Pro motion sensor in motion-sensing-and-actuating framework.',
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
    'Achieved 15% speedup in logging system for 8M+ customers.',
  ]},
  { id: 'cmu-projects', label: 'Drone-Megaddon', org: 'Carnegie Mellon University', role: 'Projects · Drone-Megaddon', dates: 'Fall 2014', kind: 'aspect', parent: 'cmu', verb: 'built', time: 0.29, bullets: [
    'Implemented end-to-end cyberphysical system in which high-level, StarCraft-like RTS interface could be used to control drone swarms.',
    'Krishnan, S., & Ting, D. (2014). Drone-Megaddon 2014: A Real-Time Strategy Interface for Managing Drone Swarms. engrXiv (archived 2026).',
  ], links: [{ href: 'https://doi.org/10.31224/6924', label: 'doi:10.31224/6924' }] },
  { id: 'microsoft', label: 'Microsoft', org: 'Microsoft', role: 'Software Development Engineer, Windows OS Group', dates: 'Mar 2015 – Oct 2016', meta: 'Redmond, WA', kind: 'work', parent: 'cmu', verb: 'joined', time: 0.42, bullets: [
    "Cut Windows 10 Mobile Mail power consumption 4x against the Windows Phone 8 baseline, and set the app's power targets.",
    'Drove product decisions with telemetry: real-time dashboards, weekly guidance to leadership, and the data-derived default for the auto-sync interval.',
  ]},
  { id: 'sig', label: 'SIG', org: 'Susquehanna International Group (SIG)', role: 'Senior Financial Data Engineer', dates: 'Nov 2016 – Mar 2018', meta: 'Philadelphia, PA · Promoted from Financial Data Engineer', kind: 'work', parent: 'microsoft', verb: 'joined', time: 0.55, bullets: [
    "Led real-time FINRA compliance surveillance across the firm's market-making transactions in C++, Python/Pandas, and Django, flagging violations at the moment of execution.",
    'Designed and shipped a real-time hardware asset-tracking system that automated capacity scaling and ended chronic inter-team coordination failures.',
  ]},
  { id: 'amazon', label: 'Amazon Alexa', org: 'Amazon', role: 'Senior Software Engineer, Alexa', dates: 'Apr 2018 – Feb 2021', meta: 'Seattle, WA · Promoted from SDE II (L5) to Senior SDE (L6)', kind: 'work', parent: 'sig', verb: 'joined', time: 0.68, bullets: [
    'Led an eight-engineer team on the Alexa Core Engine.',
    'Designed a GraphQL data-aggregation and caching platform for the Alexa Engine whose annotation-driven rule engine batched and clustered results to the right downstream services, saving $40M a year and lifting model accuracy 40%.',
    "Mentored half the team from entry level to promotion, earning selection for Amazon's Mentorship and Leadership Development Program.",
    'Collapsed partner onboarding from two weeks to 15 minutes with a self-service rapid-deployment platform.',
    'Owned operational excellence, driving the weekly issue count from 40 to 10 and re-engineering the new-user registration flow to cut peak-holiday customer issues tenfold.',
    "Led capacity planning for Prime Day and Black Friday, forecasting hardware demand and winning leadership's commitment to expand the fleet ahead of peak.",
  ]},
  { id: 'apple', label: 'Apple', org: 'Apple', role: 'Principal Engineer & Senior Engineering Leader, Knowledge Graph Platform', dates: 'Feb 2021 – Present', meta: 'Apple Media Products · Seattle, WA', kind: 'work', parent: 'amazon', verb: 'joined', time: 0.82, bullets: [
    'Led an eight-engineer team across Seattle, London, and partner sites in Europe and Latin America, reporting to the engineering director.',
    "Led architecture and cross-functional delivery of Apple's media knowledge graph, the canonical model unifying 15+ sources to power search, recommendations, and discovery for over 100 million users.",
    'Mentored engineers to promotion, shaped performance reviews, and drove hiring; set the design-review and CI/CD standards that lifted team velocity 30% and cut production incidents 45%.',
    'Built and shipped production agentic AI: an LLM ops assistant for debugging logs, traces, and metrics over MCP in natural language, and a skill platform that turned pipeline work into plain-English workflows for daily, on-call use.',
    'Led the four-office global launch of Apple Music Credits (Cupertino, Seattle, London, Singapore), coordinating a 15-engineer cross-functional program to deliver real-time credits curation for millions of tracks.',
    'Drove the platform from batch to real-time streaming, re-architecting ingestion, similarity mapping, and graph generation from Spark onto an event-driven Flink, Kafka, and Cassandra stack.',
    'Designed the ML entity-resolution system pairing similarity mapping with clustering to deduplicate entities across sources, lifting data quality 40% while cutting downstream cost.',
    'Owned the graph query services and the client library for partner teams to build on, and set the shared Protobuf contracts adopted across the platform.',
  ]},
  { id: 'wharton', label: 'Wharton', org: 'The Wharton School, University of Pennsylvania', role: 'Executive MBA, WEMBA Class of 2026', dates: 'May 2024 – May 2026', kind: 'school', parent: 'apple', verb: 'attended', time: 0.9, bullets: [
    'Palmer Scholar (top 5% of class)',
    'Benjamin Franklin Award (peer-voted)',
    "Director's List, all six terms",
    'First Year Honors',
    'Majors (5): AI in Business · Strategic Management · Operations, Information & Decision-Making · Entrepreneurship & Innovation · Business Analytics',
  ], figures: [
    { img: '/letters/first-year-honors.png', href: '/letters/first-year-honors.pdf', title: 'First Year Honors', date: 'June 13, 2025', alt: 'First Year Honors letter from the Wharton MBA Program for Executives, June 13, 2025', width: 1224, height: 1130 },
    { img: '/letters/directors-list-summer-2024.png', href: '/letters/directors-list-summer-2024.pdf', title: "Director's List", detail: 'Summer 2024', date: 'October 17, 2024', alt: "Director's List letter for Summer 2024 from the Wharton MBA Program for Executives, October 17, 2024", width: 1224, height: 1130 },
    { img: '/letters/directors-list-fall-2024.png', href: '/letters/directors-list-fall-2024.pdf', title: "Director's List", detail: 'Fall 2024', date: 'February 4, 2025', alt: "Director's List letter for Fall 2024 from the Wharton MBA Program for Executives, February 4, 2025", width: 1224, height: 1130 },
    { img: '/letters/directors-list-spring-2025.png', href: '/letters/directors-list-spring-2025.pdf', title: "Director's List", detail: 'Spring 2025', date: 'June 13, 2025', alt: "Director's List letter for Spring 2025 from the Wharton MBA Program for Executives, June 13, 2025", width: 1224, height: 1130 },
  ]},
  { id: 'praxtera', label: 'Praxtera', org: 'Praxtera AI Institute', role: 'CTO and Curriculum Designer, AI/ML Executive Education', dates: 'Sep 2025 – Present', meta: 'Philadelphia-based AI executive-education firm · concurrent with the Apple role', kind: 'work', parent: 'wharton', verb: 'joined', time: 1, bullets: [
    'Taught AI strategy to C-suite leaders at HP, Morgan Lewis, PBS, and the Philadelphia Eagles, working from an executive curriculum built on original Wharton research to help executives evaluate, govern, and deploy AI.',
    "Keynoted the Philadelphia Eagles' 12th annual Eagles Care Summit at Lincoln Financial Field in 2026, delivering \"AI for Impact\" to more than 300 community and business leaders.",
  ], links: eaglesSummitSources },
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
  { spoke: 'apple', hub: 'Decisions', entry: 'apple', bullet: 7 },
  { spoke: 'amazon', hub: 'People', entry: 'amazon', bullet: 0 },
  { spoke: 'amazon', hub: 'People', entry: 'amazon', bullet: 2 },
  { spoke: 'amazon', hub: 'Systems', entry: 'amazon', bullet: 4 },
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
