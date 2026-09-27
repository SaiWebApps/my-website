import { careerById } from './career';

export const SITE = 'https://sairambkrishnan.com';
export const personId = `${SITE}/#person`;
export const websiteId = `${SITE}/#website`;

export const profiles = {
  linkedin: 'https://www.linkedin.com/in/sairambkrishnan',
  github: 'https://github.com/SaiWebApps',
  orcid: 'https://orcid.org/0009-0004-2626-1273',
  scholar: 'https://scholar.google.com/citations?user=iQAZ87gAAAAJ',
};

export const portrait = { url: `${SITE}/assets/portrait-2026.jpg`, width: 796, height: 1000, alt: 'Portrait of Sairam Krishnan' };

const apple = careerById.apple;
const praxtera = careerById.praxtera;
const wharton = careerById.wharton;

export const person = {
  '@type': 'Person',
  '@id': personId,
  name: 'Sairam Krishnan',
  url: `${SITE}/`,
  image: portrait.url,
  email: 'mailto:sairambkrishnan@gmail.com',
  jobTitle: apple.role,
  worksFor: [
    { '@type': 'Organization', name: apple.org },
    { '@type': 'Organization', name: praxtera.org },
  ],
  hasOccupation: [
    { '@type': 'Occupation', name: apple.role },
    { '@type': 'Occupation', name: praxtera.role },
  ],
  alumniOf: [
    { '@type': 'CollegeOrUniversity', name: careerById.cmu.org },
    { '@type': 'CollegeOrUniversity', name: wharton.org },
  ],
  award: ['Benjamin Franklin Award', 'Palmer Scholar', "Director's List", 'First Year Honors'].map(name => `${name}, ${wharton.org}`),
  knowsAbout: ['Knowledge graphs', 'Entity resolution', 'Agentic AI', 'Real-time data platforms', 'Engineering management', 'AI return on investment'],
  sameAs: Object.values(profiles),
};

export const website = {
  '@type': 'WebSite',
  '@id': websiteId,
  url: `${SITE}/`,
  name: 'Sairam Krishnan',
  inLanguage: 'en',
  publisher: { '@id': personId },
};

export const pageUrl = (pathname: string) => new URL(pathname.replace(/\/$/, '') || '/', SITE).href;

export const fullTitle = (title: string, subtitle?: string) => !subtitle ? title : /[?!]$/.test(title) ? `${title} ${subtitle}` : `${title}: ${subtitle}`;
export const midSentence = (text: string) => /^[A-Z][a-z]*\b(?![-.])/.test(text) && !/^[A-Z][a-z]*[A-Z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
