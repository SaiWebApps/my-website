export type Recommendation = { quotes: string[]; person: string; role: string; context: string };
export const featuredRecommendations: Recommendation[] = [
  {
    quotes: [
      'Sai is one of the most impressive peers I met at Wharton. He combines deep technical expertise in AI and engineering with genuine empathy, strong intrinsic motivation, and a rare ability to bring together individuals with very different perspectives and personalities. He leads with clarity and purpose, consistently elevating the performance of those around him.',
      'In team settings, Sai naturally takes on complex, high-stakes challenges that require a sophisticated blend of analytics, operations, decision-making, and executive communication. He not only develops sharp, well-structured solutions, but also brings them to life as a compelling storyteller, equally effective with colleagues, senior stakeholders, and board-level audiences.',
      'I am confident Sai will excel as a high-impact manager and a purpose-driven leader. Any organization would be fortunate to have him.',
    ],
    person: 'Jonas Pulver', role: 'Head of Communications & Culture, Swiss Embassy in Japan', context: 'Wharton EMBA learning teams · 2026',
  },
  {
    quotes: [
      'Sairam has a deep commitment to his work; if there is something that needs to be completed, he acts on it immediately. As such, over time, I and others in our team rely on him for this response.',
      'That rapid response to challenges is combined with a relatively rare combination of both solid technical ability and a sense of ownership over the issues he addresses. He learns the context surrounding a problem rapidly, he can accelerate into new domains quickly and collaborate well with other teams when a solution requires input from various areas of expertise.',
      'He continues to provide support to those around him, whether by removing obstacles for colleagues, expanding on his own responsibilities or providing a consistent source of calmness during stressful periods.',
      'As a result, Sairam will make a tangible impact on any engineering organization.',
    ],
    person: 'Gajendra Babu Thokala', role: 'Senior Engineering Leader, Apple', context: 'Knowledge Graph team, four years · 2026',
  },
];
export const colleagueRecommendations: Recommendation[] = [
  { quotes: ['He is usually the first person in the team to step forward to take up any challenge. He is technically very strong and always puts extra effort to get things moving. Many times I felt comfortable discussing problems and solutions with him.'], person: 'Manoj Mandam', role: 'Principal Engineer', context: 'Amazon, same team · 2020' },
  { quotes: ["Sairam is a great engineer; he's very knowledgeable when it comes to system design and continuously seeks out new ways to improve the projects he works on. A great team player who works both diligently and smartly."], person: 'Connie Yao', role: 'Software Engineer, Google · ex-Amazon', context: 'Amazon, same team · 2020' },
  { quotes: ['Sairam is very detail oriented and at the same time has a bias for action. He often comes up with new tools and ideas for simplification that makes the team more efficient and productive.'], person: 'Xinghai Zhang', role: 'Software Engineer', context: 'Same team · 2020' },
  { quotes: ['The requirements were initially soft and he was willing and able to iterate back and forth as the requirements became clear. He included reasonable testing and validation. The jobs run reliably every day without intervention. It’s good solid code.'], person: 'Wayne Carson', role: 'Senior Data Engineer', context: 'Susquehanna International Group · 2018' },
  { quotes: ['Sairam is a quick learner and eager to tackle different technical problems. Sairam is great to work with and makes the team better with his contributions.'], person: 'Andy Davidson', role: 'Software Engineer', context: 'Same team · 2016' },
];
export const managerReviews: { year: string; quotes: string[] }[] = [
  { year: '2022', quotes: ['Sairam consistently collaborated with various members of the team to deliver on some of the key projects from the team. It’s been a great year for Trinity, and Sairam had a key role to play in its success.'] },
  { year: '2023', quotes: ['Sairam has been instrumental in numerous key projects within the team. His dedication and effective problem-solving received commendations from various partner teams for staying on top of every necessary fix and providing support to cross-functional teams. This year has been phenomenal for Sairam and the team.'] },
  { year: '2024', quotes: ['Sairam made key contributions to the Nightwatch effort, leading the design of the genre work and working with stakeholders to understand the value and sign off on the design. These designs then translated into tasks for other team members, further showing the quality of the design he produced.', 'A trend across all of Sairam’s work is his focus on always making quality-of-life improvements to whatever system he is working on. His contributions have saved everyone on the team time, every day. There are countless other examples, and they are invaluable to the team continuing to grow.'] },
  { year: '2025', quotes: ['Sairam has established himself as Trinity’s expert on our curation infrastructure. He is a valuable team player, always willing to help others and step in to explain a new concept, pair program, or debug a tricky problem. Team members all know they can count on Sairam to provide high quality code reviews that encourage the whole team to write better Scala code.', 'As Issue Response Lead, Sairam takes ownership of both maintenance of the production systems and the ongoing releases, and communicates with the team when issues are ongoing. He also served as an important mentor to an engineer on the Data Products team, helping her ramp up effectively on this complex system.'] },
];
