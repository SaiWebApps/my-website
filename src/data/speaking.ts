// Sources: the Atos deck (public/talks/knowledge-graphs), Praxtera course materials for HP and Morgan Lewis
// (Google Drive, Ventures/Praxtera), Sairam's own account of the PBS session, and src/data/career.ts.
import { careerById, eaglesSummitSources } from './career';

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
  link?: { href: string; label: string };
  engagements?: Engagement[];
};

export const talks: Talk[] = [
  {
    id: 'atos',
    org: 'Atos · Independent',
    date: 'Sept 3, 2026',
    startDate: '2026-09-03',
    title: 'Knowledge Graphs, Then Small Language Models',
    summary: 'Walked through what a knowledge graph is, how it enriches questions before they reach a model, and how it checks the model’s answer afterward, then where graphs go next: sub-graphs by topic, failure graphs, codified expertise, and the graph behind an API. Then turned to small language models: what they are, when to go small and when to go big, a live setup of a local model in five minutes, and how they change the way people work.',
    link: { href: '/talks/knowledge-graphs', label: 'Open the deck' },
  },
  {
    id: 'praxtera',
    org: 'Praxtera AI Institute',
    date: careerById.praxtera.dates,
    title: 'Executive AI Education',
    summary: careerById.praxtera.bullets[0],
    engagements: [
      {
        id: 'eagles',
        org: 'Philadelphia Eagles',
        date: 'Mar 18, 2026',
        startDate: '2026-03-18',
        eventName: 'AI for Impact · Eagles Care Summit',
        location: 'Lincoln Financial Field',
        lead: careerById.praxtera.bullets[1],
        links: eaglesSummitSources,
      },
      {
        id: 'pbs',
        org: 'PBS',
        date: 'Feb 27, 2026',
        startDate: '2026-02-27',
        eventName: 'AI strategy session · PBS',
        lead: 'Designed and taught an AI strategy session for PBS.',
        parts: [
          { title: 'AI foundations', text: 'What generative AI is and isn’t, how large language models work, and where they fail.' },
          { title: 'Data privacy and governance first', text: 'Privacy and governance frameworks as the first step, and how they set what AI can safely be used for.' },
          { title: 'First steps toward AI ROI', steps: [
            'Start with the pain points that take employees’ time away from work central to the mission.',
            'Break each pain point into a list of steps.',
            'Run those steps with a deterministic script, workflow, or skill.',
            'When the automations need coordinating, add simple agents, and let the coordination grow more complex rather than the agents themselves.',
            'Keep each agent simple enough to audit, and put the complexity in the relationships between agents.',
          ] },
        ],
      },
      {
        id: 'morgan-lewis',
        org: 'Morgan Lewis',
        date: 'Jan 20, 2026',
        startDate: '2026-01-20',
        eventName: 'AI adoption and change-management workshop · Morgan Lewis',
        lead: 'Designed and taught an AI adoption and change-management workshop for the firm’s trainers and champions.',
        parts: [
          { title: 'Why adoption fails', text: 'The innovation adoption curve, Deloitte Business Chemistry, and the MAPPR model for diagnosing resistance: Motivation, Ability, Permission, Proof, and Reinforcement.' },
          { title: 'From resistance to persuasion', text: 'Participants listed why partners, associates, and staff would refuse AI. Gemini sorted that board into ten resister personas, from the accuracy skeptic to the billable-hour traditionalist. In a live roleplay, Gemini played one persona while the facilitator used the CLEAR framework to win them over. Groups then wrote persuasion messages for their own persona and designed a champion’s toolkit: a green, yellow, and red guide to which tasks are safe for AI, office hours, flash cards, and prompt-off competitions.' },
        ],
      },
      {
        id: 'hp',
        org: 'HP',
        date: 'Oct – Nov 2025',
        lead: 'Designed and taught a two-session course at HP.',
        parts: [
          { title: 'AI Foundations for Digital Innovators', date: 'Oct 2025', startDate: '2025-10', text: 'How large language models work and where they fail, from bias to hallucination; choosing among ChatGPT, Gemini, Claude, Copilot, Perplexity, and NotebookLM; the H4W and COSTAR prompt frameworks; and AI across the software development lifecycle. Participants rewrote one message for four audiences, built a slide deck from three reports, and generated a clickable prototype in Gemini.' },
          { title: 'Applying AI in IT and Digital Solutions', date: 'Nov 12, 2025', startDate: '2025-11-12', text: 'Retrieval-augmented generation, vector databases, and knowledge graphs; custom GPTs; the difference between AI workflows and agents, and a checklist for when an agent is worth building; and AI governance. Participants built a business-requirements translator and designed an IT troubleshooting agent.' },
        ],
      },
    ],
  },
  {
    id: 'cmu',
    org: 'Carnegie Mellon University',
    date: careerById['cmu-teaching'].dates,
    title: 'Web Applications',
    subtitle: careerById['cmu-teaching'].role,
    summary: 'Redesigned the Web Applications course with the professor, planning a 20-lecture semester from client-side code and HTTP through relational and NoSQL databases, servlets, security, and Django. Built the client-side and server-side exercise sets and reference survey apps in Spring MVC, Play, and Django, and instructed 105+ students as final projects’ Agile Product Owner.',
  },
];
