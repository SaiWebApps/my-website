---
name: speaking-card
description: Write or rewrite one speaking or teaching engagement card on the Speaking page (past or future). Use for any poster on the Speaking wall, such as Jacobson Strategic, HP, Morgan Lewis, PBS, Sonova, the Eagles, Carnegie Mellon, Atos, or a new engagement.
---

# Speaking card

Write one card at a time, and get Sairam's approval before starting the next.

## Steps

1. **Gather the evidence.**
   - The deck or materials for this engagement, usually in Google Drive.
   - What the site already says: `site/content.json` (`talks`, `teachingPrograms`) and the card in `site/_build/render.py` `speaking()`.
   - The date and session titles.
2. **Answer every question yourself first, from the material.**
   - Read the material end to end before asking anything: every slide, speaker note, linked file and asset, such as the video in a web deck.
   - For each question, write the answer with its source: file, slide or line, and URL.
   - Show Sairam the answers. Don't send him questions.
   - Ask only what no source can know, and give your best-sourced guess with it.
   - A question that a closer read would answer is a failure. Example: asking whether the Atos demo was live or recorded, when the deck plays `assets/demo.mp4` from its own notes. The talk was live, and the demo was a recording played during it.
3. **Confirm the four basics with Sairam**, pre-filled from the evidence:
   - Who is the client, and what do they do?
   - How do they relate to Praxtera or to you?
   - What did you teach, in your own words?
   - Who co-taught, and what did each of you bring? Sairam is the AI subject-matter expert.
4. **Write for the buyer.** The card answers "Could he do this for my team?"
5. **Open with the program and a one-line summary** of what the team learned.
6. **Add the context:** who the audience is, and why this engagement matters, such as a first run, a relationship or scale.
7. **Make Sairam's points the sections, in his words,** all given equal weight. Never let the deck's agenda set the structure.
8. **Put each exercise inside the section it belongs to,** written as what participants did and tied to their actual work.
9. **Source every sentence** from the materials or Sairam's words.
   - Credit shared material.
   - Drop unsourced marketing numbers.
   - Add no section he didn't name.
10. **Confirm every inference with Sairam** before it goes on the card.
11. **Close with credit:** Sairam's role, and each co-teacher's role.
12. **Keep every existing fact,** moving it if needed. Leave no orphan headings.
13. **Write tight paragraphs,** each under 40 words, with no one-sentence-per-line fragments.
14. **Use the client's logo** in place of its name on the poster. The name stays as hidden text for screen readers.
15. **Critique before showing.**
   - Read every new string as a buyer would, and fix anything vague, anything that asks the reader to do the work, or anything that doesn't sell an outcome.
   - Check that the card matches the page's one design language.
   - When you'd recommend an option, apply it. Don't hand Sairam a menu.
16. **Build the site.** The build must finish without errors.
17. **Screenshot the full card opened** on desktop and phone. Show Sairam and get his approval before moving to the next card.

## How to build it

- **Content.** Put the card's text in its `talks[1].engagements[i]` record in `site/content.json`. The Jacobson record is the model:
  - `lead`: the one-line summary.
  - `context`: who the audience is and why it matters.
  - `parts`: the sections, each with a `title` and a list of `paras`.
  - `credit`: the closing credit line.
- **Edits.** Use small exact replacements. Never reformat the whole file.
- **Markup.** Copy the `jacobson` block in `speaking()`:
  - First proof: the program title (`h4`), then `lead`, then `context`.
  - Then one proof per part: the `h4` title, then one paragraph per `paras` entry.
  - Then the credit proof.
- **Logo.**
  - Find an official file: Wikimedia Commons, which records the license, or the client's own site. Prefer SVG, otherwise a PNG with a transparent background.
  - Before using an SVG, check it has no scripts, event handlers or external links.
  - Save it as `public/assets/logos/<unit id>.svg` or `.png`, and add it to `LOGOS` in `speaking()`.
  - The logo is painted in the poster's ink through a CSS mask (`.sp2-logo`), so it works on every poster colour and in dark mode.
  - If the logo has inner details drawn in white, such as the PBS head, turn them into cut-outs with an SVG `<mask>`. Otherwise the mask fills them in as solid shapes.
  - Set the size per poster with `--logo-h` in `site/speaking.css`.
  - Check it on the wall in light and dark mode.
- **Facts.** The page renders from `site/_build/data/facts.json`. The build copies edited text from `content.json` into it. A new line needs a fact record (`id` is `site:` plus its `content.json` path) and its unit in `site/_build/data/registry.json`.
- **Build the site.** Run `python3 site/_build/build.py`. The preview serves the build at http://127.0.0.1:4400/speaking.html.
- **Screenshot.** Open the card by clicking `#<id> .sp2-pull` with `{ force: true }`, because the posters sway.

## Rules

- **Structure.**
  - Praxtera AI Institute is the umbrella for its client engagements.
  - Carnegie Mellon and Atos are independent.
- **Never on the site.**
  - The wealth-management talk and its client.
  - Anything from Apple-internal sources.
- **Writing.**
  - No regular expressions in project code.
  - No em dashes.
  - No meta copy, such as clock times, "Exhibit" labels or all-caps eyebrows.
