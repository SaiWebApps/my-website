export type Bullet = { text: string; kind: 'build' | 'lead' };
export type CareerEntry = { id: string; org: string; dates: string; start: number; role: string; meta?: string; kind: 'work' | 'school'; level: number; concurrent?: boolean; bullets: Bullet[] };

const b = (text: string): Bullet => ({ text, kind: 'build' });
const l = (text: string): Bullet => ({ text, kind: 'lead' });

export const careerLedger: CareerEntry[] = [
  { id: 'praxtera', org: 'Praxtera AI Institute', dates: '2025–Present', start: 2025, role: 'AI/ML Technical Leader · Educator', meta: 'Concurrent with Apple', kind: 'work', level: 6, concurrent: true, bullets: [
    l('Designed the executive curriculum for evaluating, governing, and implementing AI initiatives, grounded in original Wharton research. Clients include HP, Morgan Lewis, PBS, and the Philadelphia Eagles.'),
    l("Keynoted the Philadelphia Eagles' 12th annual Eagles Care Summit at Lincoln Financial Field before 300+ community and business leaders."),
  ]},
  { id: 'wharton', org: 'The Wharton School', dates: '2024–2026', start: 2024, role: 'Executive MBA, Class of 2026', meta: 'Concurrent with Apple', kind: 'school', level: 5, concurrent: true, bullets: [
    b('Five majors: AI in Business, Business Analytics, Operations Information & Decision-Making, Entrepreneurship & Innovation, Strategic Management.'),
    l("Benjamin Franklin Award, Palmer Scholar, graduation with honors, Director's List in all six terms."),
    l('First-author research on enterprise AI ROI published on SSRN under faculty sponsor Prof. Gad Allon.'),
  ]},
  { id: 'apple', org: 'Apple', dates: '2021–Present', start: 2021, role: 'Principal Software Engineer · AI/ML platform lead', meta: 'Reports to the engineering director', kind: 'work', level: 5, bullets: [
    l("Led architecture and cross-functional delivery of Apple's media knowledge graph, unifying metadata from 15+ sources into one canonical model powering search, recommendations, and discovery for 100M+ users."),
    l('Directed the global launch of Apple Music Credits, coordinating a 15-engineer program across four international sites.'),
    b('Drove the re-platform from batch to real-time streaming: Spark to an event-driven architecture on Flink, Kafka, and Cassandra.'),
    b('Designed an ML entity-resolution system that improved data quality 40% and cut a core ingestion workflow from 1.5 hours to 30 minutes.'),
  ]},
  { id: 'amazon', org: 'Amazon', dates: '2018–2021', start: 2018, role: 'Senior Software Engineer, Alexa', meta: 'Promoted L5 → L6 · Seattle', kind: 'work', level: 4, bullets: [
    b('Pioneered a batching and clustering approach to Alexa Engine data mining and modeling, improving model accuracy 40% and saving $40M per year.'),
    b('Cut partner and new-customer onboarding from two weeks to 15 minutes with a self-service deployment platform.'),
    l('Owned operational excellence, driving average weekly issue count from a peak of 40 down to 10 and cutting Christmas-peak customer issues tenfold.'),
    l("Mentored half the team from entry level to associate engineer. Selected for Amazon's Mentorship and Leadership Development Program."),
  ]},
  { id: 'sig', org: 'Susquehanna International Group', dates: '2016–2018', start: 2016, role: 'Senior Financial Data Engineer', meta: 'Promoted from Financial Data Engineer', kind: 'work', level: 3, bullets: [
    l("Led real-time FINRA compliance surveillance over the firm's market-making transactions, flagging violations as they occurred, in C++, Python/Pandas, and Django."),
    b('Conceived and shipped a real-time hardware asset-tracking and distribution system, automating capacity scaling for the first time.'),
  ]},
  { id: 'microsoft', org: 'Microsoft', dates: '2015–2016', start: 2015, role: 'Software Development Engineer, Windows OS Group', meta: 'Redmond', kind: 'work', level: 2, bullets: [
    b('Set power-consumption targets for Windows 10 Mobile Mail and delivered a 4× reduction versus Windows Phone 8.'),
    l('Drove product decisions through telemetry, shipping real-time dashboards and weekly guidance to leadership, including a data-derived 15-minute default auto-sync interval.'),
  ]},
  { id: 'aws', org: 'Amazon Web Services', dates: '2014', start: 2014, role: 'Software Engineering Intern', meta: 'Seattle', kind: 'work', level: 1, bullets: [
    b('Unified logging into one framework serving up to 8M customers, with a 15% speedup, and returned with a full-time offer.'),
  ]},
  { id: 'leanfm', org: 'LeanFM Technologies', dates: '2013–2014', start: 2013, role: 'Full-Stack Developer', meta: 'Pittsburgh · Concurrent with school', kind: 'work', level: 1, concurrent: true, bullets: [
    b('Refined 3D building-visualization software used to operate and monitor facilities.'),
    b('Built a Django admin for sensor-access control across connected building systems.'),
  ]},
  { id: 'cmu', org: 'Carnegie Mellon University', dates: '2010–2014', start: 2010, role: 'Dual-degree ECE · Head TA · NSF researcher', kind: 'school', level: 0, bullets: [
    b('Dual degrees in Electrical & Computer Engineering with a business minor, and my first real taste of building platforms and leading people.'),
    l('Head TA and course developer for Web Applications Development, guiding 105+ students, and Agile Product Owner for the semester-long capstone.'),
    b('NSF-funded cyberphysical-systems research, turning 10M+ raw sensor data points into research-ready datasets.'),
  ]},
];

export type RecordField = { label: string; value: string; from: string[] };
export const canonicalRecord: RecordField[] = [
  { label: 'Team', value: '8 engineers · 3 continents', from: ['apple'] },
  { label: 'Vendors', value: '10 managed', from: ['apple'] },
  { label: 'Reach', value: '100M+ users', from: ['apple', 'aws'] },
  { label: 'Savings', value: '$40M per year', from: ['amazon'] },
  { label: 'Quality', value: '+40% data · +40% model', from: ['apple', 'amazon'] },
  { label: 'Promotions', value: 'L5 → L6 · FDE → Senior', from: ['amazon', 'sig'] },
  { label: 'Degrees', value: 'EMBA · M.S. · B.S.', from: ['wharton', 'cmu'] },
  { label: 'Honors', value: 'Franklin Award + 8', from: ['wharton', 'cmu'] },
  { label: 'Taught', value: '105+ students · 300+ leaders', from: ['cmu', 'praxtera'] },
  { label: 'Shipped', value: 'Windows · Alexa · Apple Music', from: ['microsoft', 'amazon', 'apple', 'leanfm'] },
];
