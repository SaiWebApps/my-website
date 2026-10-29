// Sources: the Atos deck (public/talks/knowledge-graphs), the Speaking & Teaching Experiences sheet (Google Drive, Ventures/Speaking & Teaching) for Sonova and Jacobson Strategic, Praxtera course materials for HP and Morgan Lewis
// (Google Drive, Ventures/Praxtera), Sairam's own account of the PBS session, and src/data/career.ts.
import { teachingPrograms } from './teaching.ts';
import { careerById, eaglesSummitSources } from './career.ts';

// Evidence records the Eagles keynote venue as Lincoln Financial Field. The owner retired the venue from visible site copy.

export type TalkPart = { title: string; date?: string; startDate?: string; text?: string; steps?: string[] };
export type Engagement = { id: string; org: string; date: string; startDate?: string; eventName?: string; location?: string; lead: string; parts?: TalkPart[]; links?: { href: string; label: string }[] };
export type Talk = {
  id: string;
  org: string;
  date: string;
  startDate?: string;
  title: string;
  subtitle?: string;
  summary: string;
  location?: string;
  link?: { href: string; label: string };
  sources?: { href: string; label: string }[];
  engagements?: Engagement[];
};

export const talks: Talk[] = [
  {
    id: 'eagles',
    org: 'Philadelphia Eagles',
    date: 'Mar 18, 2026',
    startDate: '2026-03-18',
    title: 'AI for Impact',
    summary: careerById.praxtera.bullets[1],
    sources: eaglesSummitSources,
  },
  {
    id: 'praxtera',
    org: 'Praxtera AI Institute',
    date: careerById.praxtera.dates,
    title: 'Executive AI Education',
    summary: careerById.praxtera.bullets[0],
    engagements: [
      {
        id: 'sonova',
        org: 'Sonova',
        date: 'Oct 21 – 22, 2026',
        lead: teachingPrograms.find(program => program.id === 'sonova')!.abstract,
        parts: [
          { title: 'AI Basics: Prompting', date: 'Oct 21, 2026', startDate: '2026-10-21' },
          { title: 'AI Agents: RAG, Workflows, Skills, and More', date: 'Oct 22, 2026', startDate: '2026-10-22' },
        ],
      },
      {
        id: 'pbs',
        org: 'PBS',
        date: 'Feb 27, 2026',
        startDate: '2026-02-27',
        eventName: 'Reengineering Workflows with AI · PBS',
        lead: teachingPrograms.find(program => program.id === 'pbs')!.abstract,
        parts: [
          { title: 'Reengineering Workflows with AI', text: 'Privacy and governance frameworks came first, setting what AI could safely be used for.' },
        ],
      },
      {
        id: 'morgan-lewis',
        org: 'Morgan Lewis',
        date: 'Jan 20, 2026',
        startDate: '2026-01-20',
        eventName: 'AI adoption and change-management workshop · Morgan Lewis',
        lead: teachingPrograms.find(program => program.id === 'morgan-lewis')!.abstract,
        parts: [
          { title: 'Why adoption fails', text: 'The innovation adoption curve, Deloitte Business Chemistry, and the MAPPR model for diagnosing resistance: Motivation, Ability, Permission, Proof, and Reinforcement.' },
          { title: 'From resistance to persuasion', text: 'Participants listed why partners, associates, and staff would refuse AI. Gemini sorted that board into ten resister personas, from the accuracy skeptic to the billable-hour traditionalist. In a live roleplay, Gemini played one persona while I used the CLEAR framework to win them over. Groups then wrote persuasion messages for their own persona and designed a champion’s toolkit: a green, yellow, and red guide to which tasks are safe for AI, office hours, flash cards, and prompt-off competitions.' },
        ],
      },
      {
        id: 'hp',
        org: 'HP',
        date: 'Oct – Nov 2025',
        lead: teachingPrograms.find(program => program.id === 'hp')!.abstract,
        parts: [
          { title: 'AI Foundations for Digital Innovators', date: 'Oct 2025', startDate: '2025-10', text: 'How large language models work and where they fail, from bias to hallucination; choosing among ChatGPT, Gemini, Claude, Copilot, Perplexity, and NotebookLM; the H4W and COSTAR prompt frameworks; and AI across the software development lifecycle. Participants rewrote one message for four audiences, built a slide deck from three reports, and generated a clickable prototype in Gemini.' },
          { title: 'Applying AI in IT and Digital Solutions', date: 'Nov 12, 2025', startDate: '2025-11-12', text: 'Retrieval-augmented generation, vector databases, and knowledge graphs; custom GPTs; the difference between AI workflows and agents, and a checklist for when an agent is worth building; and AI governance. Participants built a business-requirements translator and designed an IT troubleshooting agent.' },
        ],
      },
      {
        id: 'jacobson-strategic',
        org: 'Jacobson Strategic',
        date: 'Sep 3, 2025',
        startDate: '2025-09-03',
        eventName: 'AI Basics: Prompting · Jacobson Strategic',
        lead: 'Taught Jacobson Strategic’s team to prompt AI tools well.',
      },
    ],
  },
  {
    id: 'atos',
    org: 'Atos · Independent',
    date: 'Sep 3, 2026',
    startDate: '2026-09-03',
    title: 'Knowledge Graphs, Then Small Language Models',
    summary: 'Presented what a knowledge graph is, how it enriches questions before they reach a model, and how it checks the model’s answer afterward, then where graphs go next: sub-graphs by topic, failure graphs, codified expertise, and the graph behind an API. Covered small language models next: what they are, when to go small and when to go big, a live setup of a local model in five minutes, and how they change the way people work.',
    link: { href: '/talks/knowledge-graphs/index.html', label: 'Open the deck' },
  },
  {
    id: 'cmu',
    org: 'Carnegie Mellon University',
    date: careerById['cmu-teaching'].dates,
    title: 'Web Applications',
    subtitle: careerById['cmu-teaching'].role,
    summary: 'Redesigned the Web Applications course with the professor, planning a 20-lecture semester from client-side code and HTTP through relational and NoSQL databases, servlets, security, and Django. Built the client-side and server-side exercise sets and reference survey apps in Spring MVC, Play, and Django, and instructed 105+ students as Agile Product Owner for their final projects.',
  },
];
