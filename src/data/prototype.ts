// PROTOTYPE ONLY: shared content keeps the three visual directions comparable.
export const prototypeContent = {
  proposition: 'Technology is only ambitious when it works for people.',
  orientation: 'I build AI/ML systems, products, and teams that turn difficult ideas into adopted outcomes.',
  conviction: 'Grow the people. The platforms follow.',
  caseStudy: {
    organization: 'Apple',
    title: 'A shared knowledge layer for media',
    tension: 'Search, recommendations, and discovery depended on fragmented metadata and inconsistent models.',
    responsibility: 'Led architecture and cross-functional delivery of a canonical media knowledge graph.',
    scope: 'Eight engineers across three continents, serving more than 100 million users.',
    choices: [
      'Unified more than fifteen sources around one model.',
      'Moved critical ingestion from batch toward event-driven processing.',
      'Built quality and operational leverage into the platform.',
    ],
    outcomes: [
      { value: '40%', label: 'better data quality' },
      { value: '30%', label: 'faster delivery' },
    ],
    reflection: 'The difficult part was not choosing a graph. It was creating one technical truth that teams in different disciplines and locations could build on together.',
    quote: 'Sairam has established himself as Trinity’s expert on our curation infrastructure. He is a valuable team player, always willing to help others.',
    quoteSource: 'Apple manager review, 2025',
  },
  invitation: 'Let’s build what comes next.',
} as const;

export const prototypeRoutes = [
  { href: '/explore/electric-margins', label: 'Electric Margins', short: 'Margins' },
  { href: '/explore/night-signal', label: 'Night Signal', short: 'Signal' },
  { href: '/explore/curious-machine', label: 'Curious Machine', short: 'Machine' },
  { href: '/explore/material-intelligence', label: 'Material Intelligence', short: 'Material' },
] as const;
