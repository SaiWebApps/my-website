import type { APIRoute } from 'astro';
import { careerById, careerLedger } from '../data/career';
import { research, ventures } from '../data/content';
import { talks } from '../data/speaking';
import { SITE, profiles, fullTitle, midSentence } from '../data/seo';

const apple = careerById.apple;
const roles = careerLedger.filter(entry => entry.kind === 'work').reverse();
const schools = careerLedger.filter(entry => entry.kind === 'school').reverse();

const lines = [
  '# Sairam Krishnan',
  '',
  `> ${apple.role} at ${apple.org}. Leads engineering teams that build AI and data platforms at scale.`,
  '',
  `${apple.bullets[1]}`,
  '',
  '## Pages',
  '',
  `- [Home](${SITE}/): Scale and results from Amazon Alexa, Apple, and Praxtera.`,
  `- [Career](${SITE}/career): Every role and school, with the work and results in each.`,
  `- [Side Projects](${SITE}/projects): ${ventures.map(v => v.name).join(', ')}, and the full repository archive.`,
  `- [Research](${SITE}/research): ${research.length} papers with DOIs.`,
  `- [Teaching & Speaking](${SITE}/speaking): Talks, courses, and workshops.`,
  `- [Contact](${SITE}/contact): Email, LinkedIn, phone, and resume.`,
  '',
  '## Career',
  '',
  ...roles.map(entry => `- ${entry.org} — ${entry.role} (${entry.dates})${entry.bullets[0] ? `. ${entry.bullets[0]}` : ''}`),
  '',
  '## Education',
  '',
  ...schools.map(entry => `- ${entry.org} — ${entry.role} (${entry.dates}). ${entry.bullets.slice(0, 4).join('; ')}.`),
  '',
  '## Research',
  '',
  ...research.map(paper => `- ${fullTitle(paper.title, paper.subtitle)}. ${paper.authors}. ${paper.venue}. ${paper.href}\n  ${paper.summary}`),
  '',
  '## Teaching & Speaking',
  '',
  ...talks.flatMap(talk => [
    `- ${talk.title} — ${talk.org}, ${talk.date}. ${talk.summary}${talk.link ? ` Deck: ${SITE}${talk.link.href}` : ''}`,
    ...(talk.engagements ?? []).map(engagement => `  - ${engagement.org}, ${engagement.date}: ${engagement.lead}`),
  ]),
  '',
  '## Side Projects',
  '',
  ...ventures.map(project => `- ${project.name}: ${project.problem} ${project.role} Built with ${midSentence(project.system)}`),
  '',
  '## Profiles',
  '',
  `- LinkedIn: ${profiles.linkedin}`,
  `- GitHub: ${profiles.github}`,
  `- ORCID: ${profiles.orcid}`,
  `- Google Scholar: ${profiles.scholar}`,
  `- Resume: ${SITE}/assets/Sairam_Krishnan_Resume.pdf`,
  '',
  '## Contact',
  '',
  'sairambkrishnan@gmail.com',
  '',
];

export const GET: APIRoute = () => new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
