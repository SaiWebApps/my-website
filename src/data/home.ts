// Readouts in the home hero. Sources: src/data/career.ts (Apple, Amazon, Praxtera bullets).
export const heroSpecs = [
  { num: '15', unit: 'engineers in the four-office Apple Music Credits launch I led', href: '/career' },
  { num: '100M+', unit: 'users reached through media search, recommendations, and discovery', href: '/career' },
  { num: '$40M', unit: 'a year saved by the Alexa platform I designed', href: '/career#amazon' },
  { num: '300+', unit: 'leaders at my “AI for Impact” keynote for the Philadelphia Eagles', href: '/speaking' },
];

// One sourced sentence per exhibit below the hero (first person, from the career bullets).
export const exhibitLeads: Record<string, string> = {
  apple: 'I lead eight engineers, own their performance reviews and development, and build media intelligence spanning supervised entity resolution, foundation-model evaluation, and agentic operations.',
  amazon: 'I led eight engineers and redesigned Alexa’s speech-to-action orchestration, improving end-to-end recognition and routing accuracy 40% while the platform I designed saved $40M annually. I mentored half the team to promotion.',
  praxtera: 'I lead AI and executive education at Praxtera, turn AI strategy into practical workflows for clients, and delivered “AI for Impact” to 300+ leaders at the Philadelphia Eagles’ Care Summit.',
  wharton: 'I earned Palmer Scholar honors in Wharton’s Executive MBA and won the peer-voted Benjamin Franklin Award, one of three recipients in a class of 250.',
};
