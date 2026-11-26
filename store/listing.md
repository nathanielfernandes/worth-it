# Chrome Web Store listing

Copy these into the Developer Dashboard.

## Package

Upload `worth-it.zip` (run `bun run package`). Bump `version` in `static/manifest.json` for each new upload.

## Store listing

**Name:** Worth It?

**Summary**
```
See what prices cost in hours of your work, or what the money could grow to if invested. Private.
```

**Description**
```
Worth It? shows what prices really cost. Hover any price while you shop and see it as time worked (45 minutes, 8.3 hours, 2 workdays) or as what that money would grow to if you invested it instead ($2,499 → $9,670 in 20 years at 7%). Show one or both.

Set it up once:
- Hourly, weekly, every two weeks, twice a month, monthly, or yearly pay
- Or average a few recent paychecks if your hours vary
- Before or after tax
- Your hours, days per week, and weeks per year
- For growth: your expected yearly return, number of years, and compound or simple interest

Also:
- Optional badges next to every price
- Prices in other currencies, using rates you enter or optional daily reference rates
- Pause on any site with Alt+Shift+W

Private by design. Your pay is stored only in your browser. Websites can't read what the extension shows, and nothing is sent anywhere unless you turn on exchange-rate syncing, which sends only your currency code.
```

**Category:** Shopping
**Language:** English

**Graphics**
- Icon: taken from the package (128×128)
- Screenshots: `screenshot-1-hover.png`, `screenshot-2-badges.png`, `screenshot-3-settings.png`
- Small promo tile: `promo-small.png`

**Homepage URL:** https://github.com/nathanielfernandes/worth-it
**Support URL:** https://github.com/nathanielfernandes/worth-it/issues

## Privacy practices

**Single purpose**
```
Shows what the prices on web pages cost the user, either as the time they would need to work to pay for them or as what that money would grow to if invested, based on information the user enters.
```

**Permission justifications**

storage
```
Saves the user's pay and investment settings and optional exchange rates in local extension storage so they persist between sessions. Nothing is synced or transmitted.
```

alarms
```
Schedules a once-a-day exchange-rate refresh, only when the user has chosen the "Daily" rates option.
```

Host permission (content script on all sites)
```
Prices appear on any shopping site, so the content script runs on all pages to find price text and show the work-time card when the user hovers a price. Price text is read locally to compute the result and is never stored or transmitted.
```

Optional host permission (https://api.frankfurter.dev/*)
```
Requested only when the user turns on exchange-rate syncing, to download public currency reference rates. The request contains only the user's currency code. The permission is removed when the user switches back to manual rates.
```

**Remote code:** No, I am not using remote code.

**Data usage:** check these two:
- Financial and payment information (the pay amount the user enters)
- Website content (price text read on the page)

Then check all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://github.com/nathanielfernandes/worth-it/blob/main/PRIVACY.md
