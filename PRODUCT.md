# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences with equal weight (confirmed 2026-10-26). Every page serves both, and neither is hidden to serve the other.

1. **Hiring leaders.** Recruiters and hiring managers filling AI/ML Engineering Manager roles on applied-AI, platform, data, and evaluation teams at frontier labs and big tech (OpenAI, Anthropic, Google, Snowflake). They screen many candidates quickly. Their job is to confirm real people leadership (reviews, hiring, promotion mentoring), hands-on technical authority, and production AI at scale, and then open the résumé.
2. **Service buyers.** Executives, founders, and event organizers who buy Fractional CTO leadership, advisory retainers, architecture and AI work, keynotes, and masterclasses. They are choosing an advisor or speaker and judging his judgment. Their job is to see proof, understand the offers and starting prices, and book.

## Product Purpose

sairambkrishnan.com is Sairam Krishnan's personal site. Within seconds it must show that he leads engineering at the highest level, and then take each visitor to the right door: Services and Speaking for buyers, Career and Résumé for hiring leaders. It succeeds when a hiring leader opens the résumé or reaches out, or when a buyer books a call, an engagement, or a keynote.

## Positioning

"Grow the people. The platforms follow." (confirmed 2026-10-26 as the claim no peer can copy.) He is a people-first engineering leader whose teams ship AI platforms at Apple scale.
- At Apple he leads eight engineers, five of them senior, and seven vendors. He owns the engineers' performance reviews and promotion mentoring. The media graph his team builds unifies 15+ sources and powers search, recommendations, and discovery for 100M+ users.
- At Amazon he mentored half his team to promotion, and the platform he designed saved $40M a year.
- He also teaches AI strategy to executives (HP, Morgan Lewis, PBS, Sonova, and the Philadelphia Eagles keynote) and publishes on managing engineering when AI makes code cheap.

## Operating Context

- **Pages:** Home, Services, Speaking, Career, Résumé (PDF), Research, Projects, Contact, plus `llms.txt`.
- **The résumé** (`public/assets/Resume.pdf`, byte-identical to the accepted career-profile baseline) is the hiring leader's working document. The site must reach it in one click.
- **The services deck** (`decks/services/`) is generated from `src/data/services.ts` by `scripts/sync-deck.mts`.
- **Concurrent roles:** Apple, Praxtera, Ondoway, and independent work run at the same time. This is settled.

## Capabilities and Constraints

- **Stack:** Astro static site on Vercel, with `three` 0.169.0 installed.
- **Titles** (confirmed 2026-10-26, matching the résumé):
  - Apple: "Principal Software Engineer · Team Lead since 2022", Apple Media Products, Seattle.
  - Praxtera AI Institute: "Head of AI & Executive Education".
  - Résumé headline: "AI/ML Engineering Leader".
- **Facts come only from sources:** the résumé, `src/data/*.ts`, and the user's own words.
  - Never invent, round, paraphrase into a weaker claim, or drop a fact a page showed before. A fact may move to another page, but it never leaves the site.
  - The Eagles keynote figure is "300+". This is settled.
- **Never show:** compensation, negative review feedback, names of individual managers or reviewers unless the user asks, or hour or capacity figures on offers.
- **Contact today:** email (sairambkrishnan@gmail.com), LinkedIn, phone, and the résumé, all on the Contact page. There is no booking calendar.
- **Voice:** first person ("I", "my") on every surface. Quotes stay verbatim, in third person where they were written that way.
- **Routes:** Services and Speaking (buyers), and Career and Résumé (hiring leaders), are one click away from every page. On phones they may sit behind a designed menu.
- **Never delete data:** offerings, recommendations, review quotes, figures, or source comments.
- **Award letters** (`public/letters/*.png` and `.pdf`) stay on the site, under the Wharton listing.
- **Prices** (`src/data/services.ts`):
  - Architecture Call from $500; Design Review from $2,500.
  - Architecture Audit and AI ROI Review from $15,000; Evals Harness from $20,000.
  - Advisory Retainer from $5,000 a month; Fractional CTO from $12,500 a month, 3-month minimum.
  - Keynote from $5,000 plus travel; Masterclass from $6,000; Masterclass Series from $10,000.

## Brand Commitments

- **Name and identity:** Sairam Krishnan. The headline he wrote is "Grow the people. The platforms follow."
- **Voice:** active leadership verbs, bold framing around fixed facts, and no filler, clichés, taglines, or text about the page itself.
- **Portrait:** only a small round avatar (`public/assets/portrait-2026-mobile.webp`) beside his name in the navigation. No large portrait.
- **Visual constraints the user made binding (Oct 2026):**
  - No page is ever mostly a list.
  - Each screen carries one vivid subject.
  - Every page, not only Home, is held to the same ambition.
- **Craft bar he set by rating 61 sites** (loved; a bar for craft, not looks to copy): Teenage Engineering, Nothing, Rivian R2, Stripe Press, Pentagram, Collins, Dia, Daiki Fujita, Christoph Niemann, Es Devlin, Haruki Murakami, Jenny Odell, Maira Kalman, Mike Matas, Ryo Lu. Screenshots are in `mockups/taste/shots/`.

## Evidence on Hand

- **Résumé** (`public/assets/Resume.pdf`, accepted baseline): Apple, Amazon Alexa, SIG, Microsoft, Ondoway, Praxtera, Persuaider, Gestiq, skills, Wharton, Carnegie Mellon, and four papers with DOIs.
- **Career record** (`src/data/career.ts`): the full ledger with bullets, including CMU teaching, NSF research, LeanFM, AWS, Hand-2048, and Drone-Megaddon, plus the Eagles Care Summit source links.
- **Offers** (`src/data/services.ts`): 10 offers in three groups (lead, engage, speak), with abstracts, proof lines, and figures.
- **Speaking and teaching** (`src/data/speaking.ts`, `src/data/teaching.ts`): the Eagles "AI for Impact" keynote (Mar 18, 2026, Lincoln Financial Field); Praxtera programs for HP, Sonova, PBS, Morgan Lewis, and Jacobson Strategic; the Atos knowledge-graph talk with its deck at `public/talks/knowledge-graphs/`; and the CMU Web Applications course.
- **Recommendations** (`src/data/recommendations.ts`): Jonas Pulver and Gajendra Babu Thokala in full, five colleague quotes, and Apple manager reviews from 2022 to 2025.
- **Research and ventures** (`src/data/content.ts`): four papers, and Ondoway, Persuaider, Gestiq, Lore/DependIQ, and Crucible.
- **Images:** `public/projects/hand-2048-poster.jpg`, `public/projects/ondoway/user-journey/`, `public/assets/ondoway-journey-wireframe.png`, `public/assets/atos-demo-poster.webp`, and the Wharton letters.
- **Absent, never to be fabricated:** photos or video of talks, teaching, or work; client logo files; service-client testimonials beyond those listed. Anything a design needs beyond this is rendered (SVG, canvas, WebGL, type) and never faked as a photo.

## Product Principles

1. **Proof before claim.** Each screen leads with a sourced fact shown big, never a bare heading or a stack of rows.
2. **Both doors, always open.** Buyers and hiring leaders each reach their next step from every page.
3. **Leadership is the story.** Show people grown, decisions made, and platforms shipped, in active verbs.
4. **No weak page.** The site is judged by its weakest page, so inner pages get the same invention as Home.
5. **Facts fixed, framing bold.** Never weaken a fact to fit a layout. Change the layout instead.

## Accessibility & Inclusion

WCAG AA text contrast, visible keyboard focus, `prefers-reduced-motion` honored with a designed still state, and no horizontal scroll at 375px wide.
