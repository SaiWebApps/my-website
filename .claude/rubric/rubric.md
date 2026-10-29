# Site rubric

Every check is pass or fail. 100% means every check passes on every page. Two scorers: the scripts (`score.py` runs `guard.py`, `audit.mjs`, `noregex.py`, `test.py` and the frames) and a second reviewer, who scores the rows marked "reviewer" by opening every frame and reading every line as a stranger would. Every row comes from his own words. `test.py` puts each past mistake back into a copy of the site and fails if a check misses it. No check uses a regular expression: they compare the pages with his facts (`facts/facts.json`), the registry and the page structure.

## Precedence

When two rules pull against each other, the higher one wins, and the lower one yields by changing the layout, never by losing information:

1. **B0** never cut information.
2. **A** no contamination: everything at its one home.
3. Everything else. A screen over its line cap gets more screens, slides or a figure; it never gets shorter.

## Checks

| Check | What passes | His words | Enforced by |
|---|---|---|---|
| **B0** | Nothing he gave is cut. Every fact in the fact store marked "must" (every résumé bullet, title and date; every field the site was built from; every session in his sheet) is shown on some page, in its own unit. Retiring a fact takes his words in retired.json. | "That does not mean dropping or cutting info. NEVER cut info. That is a hard, top priority rubric item." (Oct 29); "you left out VERY critical details" (Oct 28); "Do not leave out any pictures… or any metrics" (Sep 16) | guard (coverage), pre (P3 refuses an edit that cuts) |
| **A1** | Every section with copy is a unit in registry.json with one home. One employer, paper, project, session or offer is one unit: never split, never merged, leadership never parked alone. | "Why did you split up Apple into 2" (Oct 27); "fold in the leadership stuff into their respective parts" (Oct 28) | guard |
| **A2** | Praxtera is a branch, never a stop; a unit named elsewhere is a link to it or navigation. | "can you tell me what you did wrong re Praxtera AI Institute" (Oct 28) | guard |
| **A3** | A fact appears only in its own unit's block, as the text of a link to that unit, or in navigation pointing at it. | "Why did you mix AI ROI with PBS?" (Oct 29); "You put research on the speaking page" (Oct 27); "you contaminate everything" (Oct 29) | guard (fact lookup) |
| **A4** | No selling outside Services and Contact, except one "Book a talk" link on Speaking. | "See, you contaminate everything" (Oct 29) | guard |
| **A5** | No fact is shown whole on two pages. | "I want the rubric to prevent this fucking disease" (Oct 29) | guard |
| **B7** | Each unit's block is present; the floor strings, every session title and date from his sheet, and every station on the home map are there. | "Look at the spreadsheet" (Oct 28); "Research line should show all 4 papers?" (Oct 27); "Contact on the map" (Oct 28) | guard |
| **B8** | Titles exactly as he gave them; Eagles reach "300+". A wrong or rounded title is no fact of his (C14); the exact ones are floor strings (B7). | "Stop fighting me" (Oct 25) | guard (C14, B7) |
| **B9** | Award letters with Wharton, the Hand-2048 poster, the Atos poster, the Ondoway wireframe stay. | "do not remove those pictures" (Sep 25) | guard |
| **B10** | Fields he never wants shown (venues, team names, durations, fees) and retired facts never appear; the two engagements he left off never appear. | "just say Apple" (Oct 27); "Why 'Lincoln Financial Field'" (Oct 27); "Leave them off" (Oct 28) | guard (fact fields) |
| **C14** | Every piece of text is one of his facts, a line he approved (with his words), or a navigation word. No invented copy, no slop, no meta copy can pass, because none of it is in his sources. | "Your subtitles are still dead wrong" (Oct 28); "No fucking metadata" (Oct 27); "AI slop. I HATE THIS PHRASE." (Sep 16) | guard (fact lookup) |
| **C12** | No small labels stacked above headings. | "small all-caps labels above headings" (Oct 28) | guard (structure), audit 7 |
| **C13** | Nothing said twice on a page. | "the Services page that listed everything twice" (Oct 28) | guard |
| **C15** | Nothing about employer policy, hours or availability in any reply. | "Stop commenting on how many hours I have" (Oct 25) | reviewer (replies); on the site, C14 |
| **C37** | Line names share one style: no line name carries a subtitle. | "Why do you even have a subtitle for this?" (Oct 28) | guard |
| **D16** | Each screen has one vivid subject. | "EVERY design you've suggested ignores everything that I want" (Sep 16) | reviewer |
| **D17** | A screen shows at most three lines of copy, 90 words in all; at most 30 words outside any unit. More is another screen. | "way too much text" (Oct 28); "You seem to love overstuffing" (Oct 28) | guard |
| **D40** | No wall of text: no line over 40 words (a sentence up to that stays whole, so it reads as one thought). A wall is re-rendered (stops, slides, one claim per screen, a figure), keeping every word; when the best rendering is a real choice, it goes to him as an image. | "Avoid walls of text… Always interrogate walls of text and explore different options for rendering in interesting manner. Run by me if you have to." (Oct 29) | guard, reviewer (the rendering) |
| **D18** | No lists of sentences, no toggles hiding dumps, no stat grids, no inventory shown twice. | "I HATE LISTS" (Oct 27); "The full record… is a mess" (Oct 28) | guard |
| **D19** | Room to breathe: blocks never touch. | "Why do you keep jamming things in together?" (Oct 28) | audit 19 |
| **D20** | Phones get phone layouts: no sideways scroll, tap targets 24 px or more, text 12 px or more. | "design phones for phones" (Oct 25) | audit 2, 10 |
| **D21** | Bold, big or sparse is never a failure; the transit map stays the identity. | "it's VERY creative and elegant" (Oct 28) | reviewer |
| **D39** | The home map stays at 120 words or fewer. | "The transit map is REALLY busy" (Oct 28) | guard |
| **E22** | Every link and anchor resolves. | "Stop introducing new errors every time" (Oct 28) | guard, audit 11 |
| **E23** | Every stop has a way back and forward; rides stop at their ends. | "You have broken the flow" (Oct 28) | guard, audit 12 |
| **E24** | The zoom from the map into a line is continuous. | "I want a seamless zoom in" (Oct 28) | audit 24 |
| **E25** | Inner pages carry his name (to Home), Résumé beside it, Home, the theme switch, nothing else; Résumé is never a station. | "Why is Resume even in the navbar?" (Oct 27); "get rid of these tab pills" (Oct 28) | guard |
| **E36** | Double-clicking a line on the home map opens that line's page. | "When I double-click on a line, I should be able to go to that page" (Oct 29) | guard, audit 36 |
| **T35** | A light/dark switch on every page that works, persists, and leaves both themes legible. | "Restore the toggle. That is invariant." (Sep 16) | guard, audit 35 |
| **F26** | The audit passes: nothing unstyled, off screen, overlapping or clipped; no script errors; the stylesheet parses; the fact store is current. | "Fix this and build a script for each failure" (Oct 28) | audit 1-15, guard |
| **F27** | Every page loads the current stylesheet and script. | "This is awful" (old stylesheet in his browser, Oct 28) | guard |
| **F28** | Every page is shot at five widths in both themes after the last change. | "Will you actually show me the changes" (Sep 16) | stop |
| **R0** | No regular expression in any check, hook, build or site script. | "No regex. I want genuine substantive checks. Never use regex." (Oct 29) | noregex (ast, TypeScript scanner), pre |
| **G29** | My reply opens with the answer and says nothing about process, rules, memory or tools. | "Who cares?" (Sep 25) | reviewer |
| **G30** | At most one question per reply, with my recommendation. | "spam me with 20 different questions" (Sep 16) | stop |
| **G31** | No proposal files in the repo; proposals are images in chat. | "Don't create proposal HTMLs" (Oct 28) | guard |
| **G32** | The changed page is opened in the browser pane before I finish. | "Always open it up once you're done" (Oct 28) | stop |
| **G33** | Every fix covers the class: every check runs on all seven pages every time. | "Do not make one-off fixes" (Oct 27) | guard (site-wide) |
| **G34** | The complete rubric is the immediate work loop after every governed change. Only one run may execute at a time, and I cannot finish until its score is 100%, newer than every change, every past mistake is still caught, and the reviewer passed it. | "Then why did you stop?" (Oct 27); "run the rubric All the time" (Oct 28) | pre, lock, stop |
| **G35** | Only the governor writes its pass and spec, and only the scoring scripts write the score and test results; the builder can never mark its own work done. | "do not stop after I approve the rubric until you and Claude both score 100%" (Oct 29) | pre |
| **G38** | Every message of his is logged in review.json, and every correction becomes a ledger entry with a plant and a check, before the turn ends. | "Each comment I make like this - Add a check" (Oct 29); "Are you even building rubric items based on all past failures, including everything in this chat?" (Oct 29) | stop, test |
| **P1** | Generated pages are never edited by hand. | a hand edit lost on rebuild (Oct 28) | pre |
| **P2** | No shell command writes to the site; only the build and check runners. | "Why are there no mechanisms or forcing functions" (Oct 28) | pre (shellcheck) |
| **P3** | An edit to the build is applied to a scratch copy first and refused if the checks find anything new, including a cut fact. | "1 proactive - prevent this from ever happening in the first place" (Oct 29) | pre |
| **P4** | The rubric only grows: past mistakes stay tested; approved and retired lines carry his words. | "refine until it is IMPOSSIBLE for you to repeat these mistakes" (Oct 29) | pre |
| **P5** | Transit is the only accepted design baseline. Its production source is `site/`; the active build and deploy artifact must derive from that source and carry the same fresh source and artifact hashes. A null, different or missing baseline fails before build. | "I wanted you to work off the mockup - the transit design?!" (Oct 29); "I never want this sort of confusion ever again" (Oct 29) | project gate, pre, stop |
| **P6** | There is one control path: `rubric_gate.py`. No second release contract, governor hook or parallel certification script may pass or deploy a build. Content, density, screenshots, visual review, mutation tests and deployment all inspect the same hash-bound artifact. | "When I say add these gates I mean add them to the rubric and add deterministic checks too." (Oct 29) | project gate, pre, stop |
| **P7** | One production website, one design source, no litter. `mockups/`, parallel page/component/layout/style implementations, scratch roots, proposal HTML, generated screenshots in source and duplicate release scripts are forbidden. Generated evidence lives only in ignored rubric output. | "you and Claude keep polluting this project with clutter" (Oct 29); "Rip out all old designs" (Oct 29); "stop calling them mockups after the cleanup" (Oct 29) | project gate, pre, test |
| **P8** | A future design is explored only on a separate Git branch or worktree. Promotion is an atomic replacement: `site/`, the registry baseline and `site/.baseline.json` must identify the same accepted design before any build; old and rejected designs remain only in Git history, never in backup or archive folders. | "What if we ever want to change the design?" (Oct 29) | project gate, test |

## What each page is

| Page | Owns | Leads with | Never carries |
|---|---|---|---|
| Home | Him (face, name, quote, title, three roles) and the map | The map, with him at the center | Anything but station names and the captions he approved |
| Career | Carnegie Mellon, Microsoft, SIG, Amazon, Apple; Wharton alongside Apple | A ride in order; each employer's leadership and results inside that employer, every résumé bullet on some slide | Papers, projects, offers, teaching, a separate leadership section |
| Speaking | What he taught and where: Carnegie Mellon teaching; the Praxtera branch (Jacobson Strategic, HP, Morgan Lewis, PBS, Eagles, Sonova); Atos | The Eagles keynote, AI for Impact, 300+ | Paper arguments, offer pitches, AI ROI framing, anything shown twice |
| Research | The four papers; Drone-Megaddon 2014 and 2026 as a pair | Each paper's own claim, figure and link, its summary and abstract as slides | Offer pitches, durations, venues as headings |
| Projects | Ondoway, Persuaider, Gestiq (from Hand-2048), Lore, Crucible | What each one is and proves, with an image of the thing | Offer pitches, line labels on every project |
| Services | The eight offers he named, behind the doors he named | The offers | Paper arguments, career numbers, durations, prices |
| Contact | Email, LinkedIn, phone, Résumé, a Fit Call link | Booking a call | Offer copy |
