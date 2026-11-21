# Lessons from T3 Code's design overhaul

T3 Code (`pingdotgg/t3code`) went through a design overhaul in October 2026. The PRs are a good lesson in the basics because each one says what changed and why, with before/after screenshots. Read in this order:

| PR                                                                                                       | What it is                                                                                      | Read it for                                                              |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [#24776](https://github.com/pingdotgg/t3code/pull/24776) UI polish overhaul (closed, folded into #24865) | Tokens and primitives only, no layout changes: font, radius, icon stroke, text levels, contrast | The basics. Image: `t3code-pr24776-polish-annotated.png`                 |
| [#24865](https://github.com/pingdotgg/t3code/pull/24865) UI design overhaul                              | The full redesign behind a Beta toggle: sidebar rows, composer, details panel, settings         | Hierarchy and quiet rows. Image: `t3code-pr24865-overhaul-annotated.png` |
| [#25251](https://github.com/pingdotgg/t3code/pull/25251) Color where it means something                  | Fixes #24865 going too gray                                                                     | When to use color. Images: `t3code-pr25251-color-*.png`                  |
| [#25277](https://github.com/pingdotgg/t3code/pull/25277) The new design on every other screen            | Brings the same language to PRs, files, diffs, usage, terminal, palette                         | Applying one system everywhere                                           |
| [#25968](https://github.com/pingdotgg/t3code/pull/25968) Design eval from screenshots                    | How they score design: same screenshots every round, a panel of models, fixed axes              | The method                                                               |

## The basics (from #24776)

Fix these first: they change every screen at once and need no layout work.

1. **A font with real weights.** Their Linux font had no 500/600, so every `font-medium` drew as regular and the hierarchy went flat. They bundled Inter. _dash: Geist is bundled with its weights, fine. Check that medium vs regular actually differ in screenshots._
2. **One radius scale with round steps.** Corners ranged from 6 to 22px; they set 4/6/8/12/16 and moved every big card to 16 or less. _dash: the scale is multipliers of 8px, giving 4, 4.8, 6.4, 8, 11.2, 14.4px. Move to round steps (4/6/8/12/16) and check which surfaces use which._
3. **Thinner icons.** Lucide's default stroke 2 to 1.75, through a zero-specificity rule so `stroke-*` classes still win. _dash: still at 2; same one-rule change in globals.css._
4. **Three text levels, used the same way everywhere.** Section title 16/600, row 14/500, description 12 muted. _dash: settings, dialogs and cards each pick their own sizes; define the levels once._
5. **Contrast you can actually read.** Brighter muted text and slightly stronger borders in dark mode; branch names at 40% opacity became readable. _dash: check muted text and borders in every theme, especially small mono numbers._
6. **Neutral controls; color only on the meaningful part.** The "Compact" pill went neutral with amber only on its icon; the disabled Send button became neutral gray instead of faded blue. _dash: the colored Stop/Restart/Update/Remove buttons and colored chips._

## Hierarchy and rows (from #24865)

- **The title leads each row; metadata sits one step below.** Read items at 75%, brightening on hover; unread/open at full white. _dash: tile name leads, address and stats one step down._
- **Icons gray at rest, color on hover**, later reverted in part (see below).
- **Collapsed groups read "Snoozed 1 ›"**, not "Snoozed (1)" with an up chevron. Open and closed headers look the same: label, count, chevron. _dash: group headings._
- **Hide what's empty.** Empty drafts hide Push and "+0 −0". _dash: hide zero chips ("0 streaming", "0 B/s") and flat charts instead of drawing them._
- **Divider lines only on hover.** Fewer lines at rest.
- **One control style** in a toolbar, with no divider lines between controls.
- **Clearer copy.** Labels say what happens ("Snooze until limits reset"). Sentence case everywhere.

## Color (from #25251)

Going fully gray "looked quiet but flat, and some states were hard to read". The rule they ended with:

- **Structure is neutral:** canvas, row fills, text levels, borders.
- **Identity is in color:** app and project icons show their real colors. _dash: keep service icons in color._
- **Action and state use the one accent:** switches, checkboxes, focus rings, the primary button.
- **Meaning gets semantic color:** green added, red deleted, a muted blue for modified "so the rare changes lead". _dash: green running, red down, amber update; healthy should not be the loudest color._
- **Focus never looks like selection:** keyboard focus is a neutral ring drawn inside with a gap, so it doesn't read as a second pick.
- **Light mode gets darker status tokens** (emerald-700 / red-700), checked to 4.5:1.

## Every screen (from #25277)

Once the language is set, apply it to every surface in one pass: titles lead rows, icons muted at rest, neutral row hover, quieter section titles. A screen left in the old style makes the new one look unfinished. _dash: board, list, service view, every dialog, settings, mail._

## The method (from #24865, #25251, #25968)

- **Screenshots of real data,** the same scenes every round, dark and light, plus phone. Scenes include the hard states: long text, loading, errors, approvals.
- **A panel of reviewer models scores them blind** on fixed axes (visual design, layout, flow clarity, polish, accessibility, responsive, motion, copy) against reference apps, and lists the top 5 fixes.
- **Iterate until every axis is 9.5+** (#24865 took 18 rounds; #25251 took 13). The scores were noisy, so they looked at the medians and at 1:1 crops before believing a low score.
- **Ship big changes behind a toggle,** so nobody is stuck with a new look they can't undo, then make it the default once it holds up, then remove the toggle.
- **Each PR shows annotated before/after** with numbered arrows and a legend.
