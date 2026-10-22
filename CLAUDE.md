# Project rules

## Content
- **Never invent facts.** Every name, date, place, number, credential, or claim must come from a source the user gave (an attached file, a page they linked, their own words). If it isn't sourced, leave it out. No guessed dates, no assumed locations, no rounded-off numbers.
- **Never annotate your own work. Ship the thing, not an explanation of the thing.** Do not add legends, keys, captions, footnotes, hints, or any text that tells the reader how to read a visual or how to operate the page — "bar weight = scope", "rows that overlap were held at once", "outline = school", "click a row", "scroll to see more", "each dot is a project". If a visual needs a decoder to be understood, the visual is wrong; fix the visual. This ban covers every surface equally: visible copy, canvas/SVG text, chart labels beyond a plain axis name, tooltips, alt text, and code comments that restate the encoding. It also covers process residue — any note about how the content was made, what was assumed, what was cut, or what the reader should notice. The deliverable never narrates itself.
- **No filler, no cliché, no throwaway lines.** Do not add generic marketing copy ("the fastest route is always email", "let's build something great together", "always happy to chat"), invented captions, taglines, decorative counts ("four review cycles"), or any sentence that exists only to fill space. If a line does not carry real, sourced information, delete it.
- **The test for every element:** does this help him look like a leader? If it doesn't, it doesn't ship.
- **Lead with active leadership verbs.** Describe what he ran, directed, built, drove, or owned — never a passive or bystander construction ("engineers led", "was responsible for", "involved in"). Change the verb, never the number: pick stronger wording only when it means the same thing as the source.
- Prefer verbatim source language (recommendations, award citations, manager comments) over paraphrase.
- Never mention compensation, salary, or pay figures anywhere.
- Never include negative feedback, development areas, or weaknesses from performance reviews.
- Do not name individual managers or reviewers unless the user asks for the name.
- **Lead with the strongest facts.** Undersell is a failure, not a safe default. Every page opens with sourced proof (Apple 100M+ users, the eight-engineer Apple team, Alexa $40M a year, the Eagles keynote, Wharton honors), never a bare heading. Proof is never hidden behind `<details>`, toggles, tabs, or clicks as the only place it appears.

## Voice
- **First person on every surface.** The site speaks as "I/my": hero, ledes, abstracts, stat labels, meta and og descriptions, llms.txt, deck slides. Never "he", "his", "him", or "Sairam" as a subject or possessive. The name appears only as identity: header link, `<title>` suffix, schema.org fields, author lists.
- The reader is "you/your" only in service abstracts and booking links.
- Proof bullets are resume lines with an implied "I": past-tense active verb first, sourced number, period. Present tense only for current roles (Apple, Praxtera).
- Verbatim quotes (recommendations, reviews, citations) stay exactly as written, in third person if that is how they were written.

## Audiences
- **Two audiences, equal weight:** customers buying services, and recruiters and hiring managers for Senior Engineering Manager roles. Never hide one to serve the other. Check every change against both.
- **One-click routes from every page, via header and footer:** Services and Speaking for customers; Career and Resume for recruiters. Never drop a nav item while changing something else. After any nav edit, confirm every one of these is still in the header and footer.

## Data
- **Never delete data.** No file, export, recommendation, review quote, offering, catalog entry, figure, or source comment is removed unless the user asks, even if nothing uses it. Edits change wording, order, and visibility. If something looks like it should go, ask.

## Numbers that carry weight
- **One number per box.** Never bundle two separate metrics into a single stat cell ("8 engineers & 10 vendors"). Every figure worth showing gets its own cell at full display size. If two numbers share a box, split the box.
- **An empty stat box beats a filler one.** Never fill a box with a decorative count or a number already shown in another box on the same page.

## Receiving criticism
- **Take it head-on.** When the user says the work is wrong, bad, or sloppy, the first line names the specific failure and what is being fixed. Never open with a phrase that steps around their reaction — "setting that aside", "regardless", "in any case", "to be fair". Do not manage their tone, do not defend the earlier choice, do not pad with apology. Acknowledge, fix, report.

## Fixes
- When the user points out a problem, search the **whole project** for every instance of that problem and fix them all. Never a one-off fix.
- After a find-and-replace, verify the result actually changed — confirm the new state, not the absence of a guessed string.

## Design
- Let text run wide. Do not add narrow `max-width` measures to body copy, quotes, or paragraphs; caps belong only on display headings.
- Match existing patterns exactly when adding something alongside them (same grid, same sizes, same treatment).
