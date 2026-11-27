# Device check: a step-by-step guide for the owner

Status: **Written 2026-11-27; not run.** This is the plain version of the scripts in [motion verification on other browsers and real devices](motion-device-verification.md). You need no technical knowledge. You look at the app on your own devices, say what you saw, and send it back. Nothing here uses real data.

## What you need

- Any of: a Mac with Safari, an iPhone, an Android phone, a Windows or Mac computer with Firefox. Do the ones you have. **Skip the rest and say "not run"; that is a fine answer.**
- 30 minutes per device.
- The address: `https://albidr.github.io/FolioDash/` (the demo with made-up numbers; never sign in to Google or import a real statement while doing this).

## Before you start, on each device

1. Open the address. Scroll to the bottom of the **Your data** page (the last item in the menu). Read the last line, "FolioDash build: ...". **Write it down.** It says which version you tested.
2. Write down the device (for example "iPhone 13, iOS 19"), the browser, and the date.
3. Start a **screen recording** (below). Recordings are the proof. Keep each one under a few minutes.

### How to record the screen

- **iPhone:** Settings, Control Center, add "Screen Recording". Then swipe down from the top right and tap the round record button. Tap it again to stop.
- **Android:** swipe down twice, tap "Screen record".
- **Mac:** press Shift, Command and 5, choose "Record Selected Portion", then Record.
- **Windows:** press the Windows key and Alt and R (Xbox Game Bar).

## Round 1: normal motion (about 10 minutes)

Do each step and say **yes or no** to the question after it.

1. **Open the app fresh.** Close the tab, open it again. Does the page build up smoothly in a second or so, with no flicker and nothing jumping around after it appears?
2. **Move around.** Tap Portfolio, then Month by month, then back. Then tap a fund in the Holdings list, then go back. Does the old page fade and the new one arrive without a blank flash? (The menu on the side or bottom should stay still.)
3. **Change things on the page.** On Portfolio change the chart period (1M, 1Y, All). Type a few letters in the "Find a fund" box, then clear it. Do the rows slide and fade instead of jumping? Do rows that stay put stay calm?
4. **Open and close things.** On Your data open "Forget this device" and cancel it. Open and close any section with a small arrow. Does it grow and shrink instead of popping?
5. **Hide the amounts.** Tap the eye or privacy button. Do the numbers disappear immediately?
6. **Jump links.** On Portfolio tap "Holdings" under "Jump to". Does the page glide there?

If anything looked wrong, stop the recording, note **which step** and **what you saw** ("step 3, the rows jumped when I typed").

## Round 2: reduced motion (about 5 minutes)

Turn on the setting that tells apps to calm down, then repeat steps 1 to 6 quickly.

- **iPhone or iPad:** Settings, Accessibility, Motion, Reduce Motion on.
- **Mac:** System Settings, Accessibility, Display, Reduce motion on.
- **Android:** Settings, Accessibility, Remove animations on (the wording varies).
- **Windows:** Settings, Accessibility, Visual effects, Animation effects off.

Expect **no sliding or fading at all**, but everything still changes correctly and nothing gets stuck half-faded. Say yes or no. **Turn the setting back off afterwards if you want.**

## Round 3: phone only (about 5 minutes)

1. Tap buttons and rows. Does each one give a tiny press reaction, and does nothing stay highlighted after you lift your finger?
2. **iPhone:** on a fund page, swipe from the very left edge to go back. Does it go back once, cleanly, with no double animation or frozen page?
3. Turn the phone sideways and back. Does the layout adapt without anything cut off?
4. Make the text larger (iPhone: Settings, Display and Brightness, Text Size; Android: Settings, Display, Font size) and look at Portfolio. Can you still scroll without sideways scrolling and without clipped text?

## Optional round 4: screen reader (Mac, about 10 minutes)

Turn on VoiceOver with Command and F5. Go to Portfolio, then tap the privacy button. It should say the amounts are hidden. Move to Expenses with the menu. VoiceOver should read the page title after you arrive. Turn it off with Command and F5. Say what it read; if you are unsure, say "not sure".

## What to send back

For each device, one short message:

- the build line, device, browser, date;
- Round 1, 2 and 3: yes or no per step, plus a note for any no;
- the recordings (or the part showing a problem).

I will turn this into the results table in the verification document. A result is only written down as passed if you saw it pass; anything you skipped stays "not run".
