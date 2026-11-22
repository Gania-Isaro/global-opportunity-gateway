# GOG quality report

I ran these checks on 21 November 2026 against the production build on my computer, with PostgreSQL 18 and the demo data.

## Automated tests (Section 5.4)

`npm test` runs 45 end to end tests through the REST API, and all 45 pass. Every functional requirement from FR 1 to FR 12 has at least one test.

## Speed (NFR 6, NFR 7, Section 5.1)

| Check | Target | Result |
|---|---|---|
| First page load on a simulated 4G connection | Under 3 s | 0.85 to 0.88 s median, 1.00 s worst |
| Search response | Under 2 s | 7 ms median, 79 ms worst |
| Challenge list with 100 users at once | No failures | 587 requests per second, 237 ms at p99, 0 errors |
| Search with 100 users at once | No failures | 733 requests per second, 158 ms at p99, 0 errors |
| Home page with 100 users at once | No failures | 553 requests per second, 205 ms at p99, 0 errors |

The load test ran locally. I did not load test the live site, because it runs on Render's free plan. That plan sleeps after 15 minutes without visits, so the first visit after a break can take up to a minute.

## Accessibility (NFR 10)

I ran axe-core against the WCAG 2.1 A and AA rules on 32 pages across the guest, participant, owner and administrator views.

- Colour contrast and form labels: no violations.
- One issue found and fixed: the logo's screen reader name did not match its visible text.
- Keyboard: the skip link is the first Tab stop, focus is visible on controls, and login works with the keyboard alone.
- Layout: no sideways scrolling at 360 px or 1920 px on any checked page.

## Browsers (NFR 13)

| Browser | Result |
|---|---|
| Google Chrome | 32 pages, no errors |
| Microsoft Edge | 32 pages, no errors |
| Mozilla Firefox | Not tested yet |
| Apple Safari | Not tested yet, needs a Mac or iPhone |

## SRS correction (BR 6)

The code is correct, so I am changing the SRS wording to:

> **BR 6:** A challenge can have only one project. A challenge owner can own many challenges, and therefore many projects.
