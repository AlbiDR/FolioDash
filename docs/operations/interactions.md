# Microanimations and interactions

This change adds exactly **32** named behaviours. This inventory counts user-visible behaviours, not CSS declarations, keyframes or every component instance. Existing chart reveals, card entry animations and mobile date sliders are outside this count.

The shared presentation layer is `src/interfaces/web/shared/ui/interactions.css`, imported after the base styles. Motion durations and easing come from `shared/tokens.css`. Functional interactions remain in their owning UI components; the financial kernel and persistence are unchanged.

| # | Addition | How to exercise it |
| --- | --- | --- |
| 01 | Consistent enabled-button press feedback | Hold a button; disabled buttons do not compress |
| 02 | Primary-action hover lift | Hover a primary action with a fine pointer; touch does not get a sticky hover |
| 03 | Keyboard button focus halo | Tab to a button; its existing focus outline remains |
| 04 | Selected navigation icon settles | Navigate to a different main destination |
| 05 | Navigation icon press feedback | Press a main navigation destination |
| 06 | Sliding time-range selection pill | Switch between 3M, 6M, 1Y and All |
| 07 | Arrow-key range selection | Focus a range button and press Left/Right; focus and selection move together and wrap |
| 08 | Home/End range shortcuts | Focus a range button; Home selects the first, End the last |
| 09 | Privacy icon swap | Toggle privacy; only the icon animates, amounts change immediately |
| 10 | Privacy-state halo | Hidden amounts keep a visible boundary on the privacy control |
| 11 | Mobile holding-row press surface | Press a fund in the phone holdings list |
| 12 | Action chevron nudge | Hover or keyboard-focus a linked fund/action row |
| 13 | Ranking-row keyboard emphasis | Tab to a fund in Gain by fund |
| 14 | Allocation-legend row emphasis | Hover or keyboard-focus an allocation fund link |
| 15 | Input hover border | Hover an enabled field with a fine pointer; invalid fields keep their error border |
| 16 | Input focus halo | Focus a text/date/select field |
| 17 | Fund/question group focus boundary | Move focus into and out of a fund fieldset |
| 18 | Checked-answer surface | Select a radio answer or the restore confirmation checkbox |
| 19 | Chart date-slider focus/drag halo | Focus or drag a chart's date slider |
| 20 | New fund card entry | Add a fund; its card enters without animating existing cards |
| 21 | Add-fund focus handoff | Add a fund; its name field receives focus and is brought into view |
| 22 | Remove-fund focus handoff | Remove a fund; focus moves to Undo removal |
| 23 | Undo focus restoration | Undo removal; focus returns to the restored name/value field |
| 24 | Entry-method panel transition | Switch Excel/manual; the newly visible panel enters and the draft remains mounted |
| 25 | Values/review transition | Continue to review, then return to values; existing answers remain under the existing retention rules |
| 26 | Disclosure-content entrance | Expand a definitions, values table or comparison disclosure |
| 27 | Disclosure indicator rotation | Open/close a disclosure; the chevron follows its native open state |
| 28 | Real-work spinner | Read a file or save a statement; the spinner follows that actual state and stops afterwards |
| 29 | Notice/error entrance | Trigger a new notice or validation message; it fades in once and stays available |
| 30 | Chart legend spotlight | Select a legend name; other lines soften. Select it again to clear. Every observation and axis bound stays unchanged |
| 31 | Active chart-point emphasis | Explore chart dates; active markers grow subtly without animating financial coordinates |
| 32 | Monthly bar pin/unpin | Tap/click a bar or activate it with Enter/Space; the selected month remains after the pointer leaves. Activate it again to release it |

## Behaviour limits

- No delay before navigation, saving, privacy changes or error display. No count-up amounts, invented progress, vibration, sound or automatic dismissal.
- Hover effects require a hover-capable fine pointer. Focus handoffs preserve the entered values; real Android keyboard appearance remains a device check.
- Reduced motion disables animations and transitions, including pseudo-elements such as the spinner and selection pill. All selections, focus changes, disclosures and chart controls remain functional.
- Chart spotlight changes opacity only. It does not filter series, refit axes, rewrite history or change any metric. Monthly pinning changes only the inspected observation.
- Save-state feedback uses `data-busy` rather than suppressing the live status region with `aria-busy`, so work announcements remain available.

## Verification

Run `npm run verify` for the full source and build gates. Browser acceptance additionally checks the numbered behaviours, range focus/shortcuts, add/remove/undo focus, chart spotlight with unchanged paths/ticks, monthly pinning, draft retention, narrow-layout overflow, and reduced-motion computed styles. Record actual results separately from physical Android/WebAPK, screen-reader and live Google testing.

Local browser evidence (headless desktop Chrome, synthetic portfolio, 2026-11-03):

| Check | Result |
| --- | --- |
| Inventory has 32 sequential unique entries | PASS |
| Range End, Home and wrapping Left selection, focus and pill transform | PASS |
| Legend highlight/reset, with identical line paths and axis tick text before/after | PASS |
| Monthly bar Enter to pin, pointer leave retention, Space to release | PASS |
| Add focus, remove-to-undo focus, restore-to-field focus | PASS |
| Reduced-motion computed animation/transition styles, including spinner pseudo-element | PASS |
| Manual draft, removal undo, review/back and movement-answer retention | PASS |
| Five main screens at 320/390/430/844/1440px, narrow touch-target checks, short viewport and doubled root text | PASS: the prior mobile layout checks remain green |

Physical touch feel, Android software-keyboard behaviour, screen-reader announcements and live Google saving are NOT RUN here. The feedback layer also needs a visual judgement on the actual phone; a computed-style or synthetic interaction check cannot establish that it feels right there.
