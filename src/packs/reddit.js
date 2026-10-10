/**
 * REDDIT PACK. See packs/youtube.js for the full pack-contract and
 * feature-field writeup; this file follows it exactly.
 *
 * ── Verification status (read before trusting any selector here) ──────────
 * Every entry is still `verified: 'unverified'`: reddit.com serves its "prove
 * your humanity" interstitial to automated browsers, and the Wayback Machine
 * archives that same interstitial rather than the real page (D15, D21). So
 * no selector here was inspected on a live page by this project.
 *
 * What changed in D21 is where they come from. The first version was written
 * from memory and included tags that do not exist. Every tier-1/tier-2
 * selector below now comes from rules that the big, actively maintained
 * filter lists (EasyList, uBlock Origin's own lists, Fanboy's Annoyances)
 * ship today for www.reddit.com, cross-checked as of 2026-10. Those lists are
 * exercised against the real site by millions of users daily, which is the
 * best evidence available short of a live audit. Old-Reddit selectors
 * (`.promotedlink`, `.side`, `#siteTable`) ride along as harmless extras for
 * anyone on old.reddit.com.
 *
 * Shadow DOM: shreddit-* components render their insides in shadow roots, so
 * page CSS can only ever hide a component's HOST element, never something
 * inside it. That is why there is no "hide vote counts" toggle here: the
 * score lives inside shreddit-post's shadow root.
 */
(function () {
  const groups = [
    { id: 'feed',     label: 'Feeds',           blurb: 'The home and Popular listings, and what gets injected into them.' },
    { id: 'sidebar',  label: 'Sidebars',        blurb: 'Discovery links on the left, the whole right-hand rail.' },
    { id: 'social',   label: 'Upsells',         blurb: 'Awards, Premium, and "get the app" nags.' },
    { id: 'comments', label: 'Comments',        blurb: 'Collapse threads behind one click.' },
  ];

  const features = [
    // ───────────────────────── FEEDS ─────────────────────────
    {
      id: 'promoted_posts', group: 'feed', pages: 'all', kind: 'css', risk: 'low', since: 1, verified: 'unverified',
      label: 'Promoted posts & ads',
      desc: 'Sponsored posts in feeds, the ad under a post, and sidebar ad slots.',
      sel: [
        'shreddit-ad-post',
        'shreddit-comments-page-ad',
        'shreddit-sidebar-ad',
        '[data-faceplate-tracking-context*=\'"promoted":true\']',
        'div[data-before-content="advertisement"]',
        '.promotedlink',
        '.native-ad-container',
      ],
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'home_feed', group: 'feed', pages: 'home', kind: 'css', risk: 'low', since: 2, verified: 'unverified',
      label: 'Home & Popular feeds',
      desc: 'Removes the algorithmic listings on Home, Popular and All. Subreddits you open stay readable.',
      sel: ['shreddit-feed', '#siteTable'],
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'home_placeholder', group: 'feed', pages: 'home', kind: 'js', risk: 'low', since: 2, verified: 'unverified',
      label: 'Show a calm placeholder',
      desc: 'Puts a short question where the feed was, so the page reads as intentional, not broken.',
      handler: 'homePlaceholder',
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'trending_search', group: 'feed', pages: 'all', kind: 'css', risk: 'med', since: 2, verified: 'unverified',
      label: 'Trending searches',
      desc: 'The "Trending today" list that opens under the search box.',
      sel: ['[id^="reddit-trending-searches"]', 'faceplate-tracker[noun="trending"]'],
      modes: { light: true, deep_focus: true },
    },

    // ───────────────────────── SIDEBARS ─────────────────────────
    {
      id: 'discovery_nav', group: 'sidebar', pages: 'all', kind: 'css', risk: 'med', since: 2, verified: 'unverified',
      label: 'Popular / All / Explore links',
      desc: 'The left-nav and header shortcuts into the sitewide firehose.',
      sel: [
        'reddit-sidebar-nav a[href="/r/popular/"]',
        'reddit-sidebar-nav a[href="/r/all/"]',
        'reddit-sidebar-nav a[href="/explore/"]',
        '#left-sidebar a[href="/r/popular/"]',
        '#left-sidebar a[href="/r/all/"]',
        '#left-sidebar a[href="/explore/"]',
        'header a[href="/r/popular/"]',
        'header a[href="/r/all/"]',
      ],
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'right_sidebar', group: 'sidebar', pages: 'all', kind: 'css', risk: 'med', since: 1, verified: 'unverified',
      label: 'Right sidebar',
      desc: 'Popular communities, recent posts, and every other right-rail widget.',
      sel: ['#right-sidebar-container', '#right-sidebar-contents', '.side'],
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'left_sidebar', group: 'sidebar', pages: 'all', kind: 'css', risk: 'med', since: 2, verified: 'unverified',
      label: 'Left sidebar (all of it)',
      desc: 'The whole navigation rail, including your own communities. Search still works.',
      sel: ['#left-sidebar-container', 'flex-left-nav-container', 'reddit-sidebar-nav'],
      modes: { light: false, deep_focus: false },
    },

    // ───────────────────────── UPSELLS ─────────────────────────
    {
      id: 'award_prompts', group: 'social', pages: 'all', kind: 'css', risk: 'med', since: 1, verified: 'unverified',
      label: 'Award buttons',
      desc: 'The award / gift button on posts and comments.',
      sel: ['award-button', 'shreddit-award-button'],
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'app_upsells', group: 'social', pages: 'all', kind: 'css', risk: 'med', since: 2, verified: 'unverified',
      label: '"Get the app" & Premium nags',
      desc: 'App-install prompts, the open-in-app bar, and Premium banners.',
      sel: [
        'xpromo-app-selector',
        'xpromo-top-button',
        '#xpromo-bottom-sheet',
        '[bundlename="bottom_bar_xpromo"]',
        'shreddit-async-loader[bundlename="app_selector"]',
        '[slot="use-app"]',
        '.premium-banner-outer',
        '.premium-banner',
      ],
      modes: { light: true, deep_focus: true },
    },

    // ───────────────────────── COMMENTS ─────────────────────────
    {
      id: 'comment_collapse', group: 'comments', pages: 'comments', kind: 'js', risk: 'low', since: 1, verified: 'unverified',
      label: 'Collapse comments behind a button',
      desc: 'Same escape hatch as YouTube: keep access, just stop falling in.',
      handler: 'collapseComments',
      modes: { light: false, deep_focus: true },
    },
  ];

  const H = {};

  // core/dom.js's collapseWithReveal was extracted from this exact
  // choreography — see packs/youtube.js's own collapseComments and D15.
  H.collapseComments = () =>
    globalThis.QS.dom.collapseWithReveal('shreddit-comment-tree, .commentarea > .sitetable', {
      buttonClass: 'qs-reveal-btn',
      buttonText: 'Show comments',
    });

  H.homePlaceholder = () =>
    globalThis.QS.dom.placeholder('shreddit-feed, #siteTable', {
      id: 'qs-placeholder',
      className: 'qs-placeholder',
      text: 'What did you come here to read?',
    });

  // Every algorithmic listing counts as "home" — the front page's sort tabs
  // and r/popular, r/all — since they are the same doomscroll wearing
  // different URLs. A subreddit's own listing deliberately does not.
  const HOME_RE = /^\/(best|hot|new|top|rising|r\/popular|r\/all)?\/?$/;

  const pages = {
    home:      (url) => HOME_RE.test(url.pathname),
    comments:  (url) => /^\/r\/[^/]+\/comments\//.test(url.pathname),
    search:    (url) => url.pathname.startsWith('/search') || /^\/r\/[^/]+\/search/.test(url.pathname),
    subreddit: (url) => /^\/r\/[^/]+/.test(url.pathname),
    user:      (url) => /^\/(u|user)\//.test(url.pathname),
  };

  const modes = {
    // Generic mode names rather than a Reddit-flavoured pair — see D15/D17.
    light:      { label: 'Light', blurb: 'Ads, trending searches and upsells go. The rest of Reddit stays normal.' },
    deep_focus: { label: 'Deep Focus', blurb: 'No home feed, no sidebars, comments collapsed. Open a subreddit on purpose.' },
  };

  const pack = {
    id: 'reddit',
    label: 'Reddit',
    hosts: ['*://*.reddit.com/*'],
    pages,
    groups,
    features,
    handlers: H,
    modes,
    customBaseMode: 'light',
    // No navEvents: Reddit's own SPA-navigation event name still needs live
    // access to confirm (D15). The href-poll in core/main.js covers it.
  };

  // See packs/youtube.js's export for why both `pack` and `packs` are set.
  globalThis.QS = Object.assign(globalThis.QS || {}, {
    pack,
    packs: { ...(globalThis.QS && globalThis.QS.packs), [pack.id]: pack },
  });
})();
