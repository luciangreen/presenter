# Presenter

Presenter makes slide decks in Lucian Office, inside [LucianOS](https://github.com/luciangreen/lucianos). You give it:

- the length of the talk;
- the references you need;
- the speaker (name, role and speaker ID);
- an intro line;
- a layout;
- what the talk is about, as text, a Writer document or a Counter workbook.

It builds a deck that fits the time, with every reference listed and cited. You can edit the slides, present them with a timer, and export them to present anywhere. It works in the browser on a computer or a phone.

## Install

Presenter is built on the [Lucian Office core](https://github.com/luciangreen/lucianoffice). To use Counter workbooks, it needs [Counter](https://github.com/luciangreen/counter) too. Clone them into LucianOS's `apps` folder, side by side, and restart LucianOS:

```sh
cd lucianos/apps
git clone https://github.com/luciangreen/lucianoffice
git clone https://github.com/luciangreen/counter
git clone https://github.com/luciangreen/presenter
```

## How a deck is built

| Step | How |
| --- | --- |
| Number of slides | The time ÷ minutes a slide (the pace, 1.5 by default), at least 3 |
| Fixed slides | The intro (title, intro line, speaker and speaker ID), one slide per 6 references, and a closing slide for questions |
| Content slides | What is left, shared between Counter's graphs and key figures and the text's sections, in proportion to how much each has to say |
| Too much to say | The most important sentences become bullets: those with numbers, words the section title shares, words that come up often, and openings. The rest go in the speaker notes. If there are more sections than slides, their best points share "Key points" slides. |
| Too little to say | The deck is shorter and each slide gets more time. Nothing is padded. |
| References | All of them are listed on the references slides. Each one is also cited, as [1], on slides about the words you give it ("cite on slides about test scores"). |
| Time | Each slide gets a share of the talk; the intro, references and closing get half a share. |

The panel says how the plan worked out, for example: "6 slides for 10 minutes (7 at this pace) ✓. There is content for 6 slides; each slide gets more time instead of padding."

### Where the content comes from

- **What it's about** (text): a short line on its own is a heading, and blank lines separate paragraphs.
- **Writer documents** (`.writer.json`): headings start sections and paragraphs fill them. Inspiration notes and deleted paragraphs are left out.
- **Counter workbooks** (`.counter.json`): labels in column A beside numbers in column B become key figures, results (formulas) first, shown as they are formatted in Counter. A sheet with a graph set up becomes a graph slide.

### Layouts

- **Classic**: up to 4 points.
- **Two columns**: up to 6 points.
- **Big statement**: one point, large.
- **Minimal**: up to 3 points.

The intro and closing slides have their own style.

## Using it

- Set the talk's details on the left and press **Build the deck**.
- Click a slide in the strip to edit its title, points and speaker notes.
- **Undo** and **Redo** cover everything, including rebuilding.
- **▶ Present** shows the slides full screen.
  - Arrow keys, space, a click or a swipe change slides.
  - N shows the speaker notes.
  - Escape ends.
  - A timer shows the time on this slide against its share, and the talk so far against its length. It turns orange when a slide runs over.
- **Tell Lucian** (or say it to the desktop character while Presenter is in front):
  - "make it 10 minutes", "use the minimal layout", "build the deck";
  - "add a slide about results", which fills it from your text where it mentions results;
  - "delete slide 3", "move slide 2 to 4";
  - "add a reference Smith (2020) Mindful classrooms for test scores";
  - "the speaker is Lucian Green", "call the talk Meditation in schools";
  - "how long is it", "present", "what changed";
  - "undo that", which undoes only Lucian's last change.
- **Save** writes `Name.presenter.json` (a Lucian Office document) with its Prolog form beside it.
- **Export**:
  - **Slides to present anywhere** writes one self-contained `.html` file. Open it in any browser, on a computer or a phone, and use the arrow keys or swipe; N shows the notes.
  - **Outline with notes** writes Markdown.
  - **Prolog form** writes the Prolog form.

## Tests

```sh
npm test
```

The tests need the core beside Presenter (`../lucianoffice`). If Counter is there too (`../counter`), one test reads a real Counter workbook. They check:

- **the slide count fits the time**, for talks of 3 to 60 minutes at different paces and with little or a lot to say, and the slide times add up to the talk;
- **every reference appears**, on the references slides, in the exported HTML deck and in the outline, and is cited on slides about it;
- the speaker on the intro and on every slide;
- choosing bullets when there is too much to say, with nothing lost from the notes;
- no padding when there is too little to say;
- layouts;
- Writer and Counter content;
- the character's commands, with undo;
- the exports.

GitHub Actions runs them with the core and Counter checked out beside Presenter.

## Not yet

- A rehearsal timer that records how long each slide took.
- Export to .pptx and PDF.

## Inputs and outputs

`io/ios.txt` lists 200 inputs and the outputs they give, from real runs of this repo's functions (the list of functions is in `io/cases.mjs`; the inputs come from a fixed seed, so they are the same every time). `npm test` runs them again and fails if any output changes. If a change is meant, run `npm run ios` to write the new outputs and check the diff.
