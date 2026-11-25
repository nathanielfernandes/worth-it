# Chrome Web Store listing

Copy these into the Developer Dashboard.

## Package

Upload `worth-it.zip` (run `bun run package`). Bump `version` in `static/manifest.json` for each new upload.

## Store listing

**Name:** Worth It?

**Summary**
```
See what prices cost in hours of your work. Your pay stays on your device.
```

**Description**
```
Worth It? shows prices as time worked. Hover any price while you shop and see what it costs you: 45 minutes, 8.3 hours, 2 workdays, 1.5 work weeks.

Set it up once:
- Hourly, weekly, every two weeks, twice a month, monthly, or yearly pay
- Or average a few recent paychecks if your hours vary
- Before or after tax
- Your hours, days per week, and weeks per year

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
Shows the prices on web pages as the amount of time the user would need to work to pay for them, based on pay information the user enters.
```

**Permission justifications**

storage
```
Saves the user's pay settings and optional exchange rates in local extension storage so they persist between sessions. Nothing is synced or transmitted.
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
