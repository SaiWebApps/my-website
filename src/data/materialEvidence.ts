import { leadershipCases, fullRecordSections } from './content';
import { careerLedger } from './career';
import { managerReviews } from './recommendations';

// Preserve the supplied source records; these additions belong to this prototype.
export const materialCases = leadershipCases.map((entry) => {
  if (entry.slug === 'knowledge-graph') return {
    ...entry,
    title: 'Apple’s media Knowledge Graph',
    scope: 'Lead eight engineers across three continents and manage ten vendors. The platform serves more than 100 million users.',
    decisions: [
      'Unified metadata from 15+ sources into a canonical Knowledge Graph for search, recommendations, and discovery, driving improvements in Apple’s ML pipelines, including Siri.',
      'Drove the migration from batch Spark to real-time processing with Flink, Kafka, and Cassandra.',
      'Designed ML entity resolution and cut a core ingestion workflow from 1.5 hours to 30 minutes.',
      'Built the LLM-powered operations assistant and the agentic skill platform used by the team on-call, end to end.',
      'Mentored engineers to promotion, shaped performance reviews, and drove hiring. Set design-review and CI/CD standards that lifted team velocity 30% and cut production incidents 45%.',
      'Owned graph query services, the partner client library, and shared Protobuf contracts adopted across the platform.',
    ],
  };
  if (entry.slug === 'music-credits') return {
    ...entry,
    title: 'Apple Music Credits: global launch',
    situation: '',
    scope: 'A 15-engineer cross-functional program across Cupertino, Seattle, London, and Singapore.',
    decisions: [],
    result: 'Delivered real-time credits curation for millions of tracks through a coordinated global launch.',
  };
  return {
    ...entry,
    title: 'Alexa Core Engine: $40M saved annually',
    scope: 'Led an eight-engineer team on Alexa Core Engine. Promoted from SDE II (L5) to Senior SDE (L6).',
    decisions: [
      'Designed the GraphQL data-aggregation and caching platform, with an annotation-driven rule engine that batched and clustered results for downstream services.',
      'Built a self-service deployment platform that cut partner and new-customer onboarding from two weeks to 15 minutes.',
      'Drove weekly issues from a peak of 40 to 10 and cut Christmas-peak customer issues tenfold.',
      'Mentored half the team from entry level to associate engineer; selected for Amazon’s Mentorship and Leadership Development Program.',
      'Led Prime Day and Black Friday capacity planning, forecasting hardware demand and securing leadership commitment to expand the fleet.',
    ],
  };
});

export const appleReviews = [...managerReviews].reverse();

export const materialRecordSections = fullRecordSections.map((section) => {
  if (section.id === 'career') return {
    ...section,
    entries: careerLedger.filter((entry) => entry.kind === 'work').map((entry) => ({
      title: entry.org,
      detail: `${entry.dates} · ${entry.id === 'praxtera' ? 'CTO and Curriculum Designer, AI/ML Executive Education' : entry.role}${entry.meta ? ` · ${entry.meta}` : ''}`,
      bullets: [
        ...entry.bullets.map(({ text }) => text.replace('Alexa Engine', 'Alexa Core Engine')),
        ...(entry.id === 'apple' ? [
          'Lead eight engineers across three continents and manage ten vendors. Engineering spans Seattle, Cupertino, DC, London, and Amsterdam; QA is in Bangalore and vendors are in South America.',
          'Mentored engineers to promotion, shaped performance reviews, and drove hiring. Design-review and CI/CD standards lifted team velocity 30% and cut production incidents 45%.',
          'Built the LLM operations assistant and on-call agentic skill platform end to end; owned graph query services, the partner client library, and shared Protobuf contracts.',
          'The Knowledge Graph drives improvements in Apple’s ML pipelines, including Siri.',
        ] : []),
        ...(entry.id === 'amazon' ? ['Led an eight-engineer Alexa Core Engine team; led Prime Day and Black Friday capacity planning and secured fleet expansion.'] : []),
      ],
    })),
  };
  if (section.id === 'education') return {
    ...section,
    entries: careerLedger.filter((entry) => entry.kind === 'school').map((entry) => ({
      title: entry.org,
      detail: entry.id === 'cmu' ? 'M.S. Electrical & Computer Engineering, December 2014 · GPA 4.0/4.0. B.S. Electrical & Computer Engineering, May 2014 · Minor in Business Administration.' : `${entry.dates} · ${entry.role}`,
      bullets: entry.bullets.map(({ text }) => text),
    })),
  };
  if (section.id === 'honors') return {
    ...section,
    entries: [
      { title: 'Benjamin Franklin Award', detail: '2026 · Peer-voted, one of three recipients in a class of 250 · Wharton' },
      { title: 'Palmer Scholar', detail: '2026 · Top 5% of the graduating class by cumulative GPA · Wharton' },
      { title: 'Graduation With Honors', detail: '2026 · Top 20% of the graduating class by cumulative GPA · Wharton' },
      { title: 'First Year Honors', detail: '2025 · Top 20% over the first three terms · Wharton' },
      { title: 'Director’s List', detail: 'All six terms · Top 10% · Wharton' },
      { title: 'Dean’s List', detail: '2012–2014 · All three years · Carnegie Institute of Technology' },
      { title: 'Jesse Jones Scholarship', detail: '2010 · Houston Endowment' },
      { title: 'National Merit Finalist', detail: '2010 · National Merit Scholarship Program' },
    ],
  };
  if (section.id === 'teaching') return {
    ...section,
    entries: [
      { title: 'Praxtera AI Institute · Executive curriculum', detail: 'Designed the curriculum for evaluating, governing, and implementing AI initiatives. Clients include HP, Morgan Lewis, PBS, and the Philadelphia Eagles.' },
      { title: 'Eagles Care Summit 2026', detail: 'Keynoted the Philadelphia Eagles’ 12th annual summit at Lincoln Financial Field before 300+ community and business leaders.' },
      { title: 'Carnegie Mellon · Head TA and course developer', detail: 'Web Applications Development for 105+ students; Agile Product Owner for the semester-long capstone.' },
    ],
  };
  return section;
});

export const franklinCitation = [
  'Sairam stands out for the consistency and substance he brought to every aspect of the program. He was always well-prepared, contributed thoughtfully, and had a clear ability to connect classroom concepts to practical, real-world situations in a way that benefited the broader discussion.',
  'Equally important is how he supported those around him. Sairam was generous with his time and knowledge, readily offering help and insight to classmates and strengthening team outcomes without seeking recognition. He approached his work with focus and discipline, while maintaining a collaborative, grounded presence.',
];
export const honorLetters = [
  { award: 'First Year Honors', file: 'first-year-honors', label: 'First Year Honors' },
  { award: 'Director’s List', file: 'directors-list-summer-2024', label: 'Summer 2024' },
  { award: 'Director’s List', file: 'directors-list-fall-2024', label: 'Fall 2024' },
  { award: 'Director’s List', file: 'directors-list-spring-2025', label: 'Spring 2025' },
];
