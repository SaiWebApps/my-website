import type { APIRoute } from 'astro';
import { careerById, careerLedger } from '../data/career';
import { research, ventures } from '../data/content';
import { talks } from '../data/speaking';
import { services, masterclasses, terms, money } from '../data/services';
import { SITE, profiles, fullTitle, midSentence } from '../data/seo';

const apple = careerById.apple;
const roles = careerLedger.filter(entry => entry.kind === 'work').reverse();
const schools = careerLedger.filter(entry => entry.kind === 'school').reverse();

const lines = [
  '# Sairam Krishnan',
  '',
  `> I lead engineering teams at ${apple.org} as ${apple.role}. At Amazon, I designed the data-aggregation and caching platform for the Alexa Engine that saved $40M a year.`,
  '',
  `I ${midSentence(apple.bullets[0])} I ${midSentence(apple.bullets[1])}`,
  '',
  '## Pages',
  '',
  `- [Home](${SITE}/): Scale and results from Apple, Amazon Alexa, Praxtera, and Wharton.`,
  `- [Services](${SITE}/services): ${services.map(s => s.name).join(', ')}, with starting prices.`,
  `- [Speaking](${SITE}/speaking): I keynoted the Philadelphia Eagles’ Eagles Care Summit for more than 300 leaders and delivered talks, courses, and workshops for HP, Morgan Lewis, PBS, Atos, and Carnegie Mellon.`,
  `- [Career](${SITE}/career): Every role and school, with the work and results in each, and recommendations from colleagues and Apple manager reviews.`,
  `- [Research](${SITE}/research): My first-author papers on engineering management, AI ROI, and drone-swarm control, with DOIs.`,
  `- [Projects](${SITE}/projects): ${ventures.map(v => v.name).join(', ')}, and the full repository archive.`,
  `- [Resume](${SITE}/assets/Sairam_Krishnan_Resume.pdf): My resume as a PDF.`,
  `- [Contact](${SITE}/contact): Email, LinkedIn, phone, and resume.`,
  '',
  '## Career',
  '',
  ...roles.map(entry => `- ${entry.org} — ${entry.role} (${entry.dates})${entry.bullets[0] ? `. ${entry.bullets[0]}` : ''}`),
  '',
  '## Education',
  '',
  ...schools.map(entry => `- ${entry.org} — ${entry.role} (${entry.dates}). ${entry.bullets.slice(0, 4).join(' ')}`),
  '',
  '## Research',
  '',
  ...research.map(paper => `- ${fullTitle(paper.title, paper.subtitle)}. ${paper.authors}. ${paper.venue}. ${paper.href}\n  ${paper.summary}`),
  '',
  '## Speaking',
  '',
  ...talks.flatMap(talk => [
    `- ${talk.title} — ${talk.org}, ${talk.date}. ${talk.summary}${talk.link ? ` Deck: ${SITE}${talk.link.href}` : ''}`,
    ...(talk.engagements ?? []).map(engagement => `  - ${engagement.org}, ${engagement.date}: ${engagement.lead}`),
  ]),
  '',
  '## Services',
  '',
  ...services.map(s => `- ${s.name} (${s.length}), ${s.priceLabel} ${money(s.price)}: ${s.abstract}`),
  `- Masterclass and keynote topics: ${masterclasses.map(m => m.title).join('; ')}. ${terms}`,
  '',
  '## Projects',
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
