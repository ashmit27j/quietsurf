/**
 * LINKEDIN PACK. See packs/youtube.js for the full pack-contract and
 * feature-field writeup; this file follows it exactly.
 *
 * ── Verification status (read before trusting any selector here) ──────────
 * Every entry is `verified: 'needs-account'`: LinkedIn's feed, rails and
 * notifications do not exist for a signed-out session (D18), and this project
 * has no signed-in account to audit against.
 *
 * Why the first version did not work (D21): LinkedIn has been migrating its
 * feed off the class-name DOM (`.feed-shared-update-v2`,
 * `.scaffold-layout__aside`) onto a new one keyed by `componentkey`,
 * `data-testid="mainFeed"` and `data-display-contents` wrappers, and serves
 * either one depending on the account. The old pack only knew the old DOM.
 * Every selector below targets BOTH, taken from the rules the actively
 * maintained filter lists (uBlock Origin, EasyList, Fanboy) ship for
 * linkedin.com as of 2026-10, which are the best evidence there is short of a
 * live audit.
 *
 * Promoted and Suggested posts carry no attribute that says so: in both DOMs
 * the only marker is the visible "Promoted" / "Suggested" text. CSS cannot
 * match text, so a handler STAMPS matching posts with a data-qs-* attribute
 * and the registry's CSS hides that attribute. JS acts, CSS still does the
 * hiding (rule 2), so a re-render that keeps the node keeps it hidden.
 */
(function () {
  const groups = [
    { id: 'feed',     label: 'Feed',     blurb: 'Promoted and suggested posts, or the whole feed.' },
    { id: 'sidebar',  label: 'Sidebars', blurb: 'News, follow suggestions, people you may know, Premium.' },
    { id: 'social',   label: 'Social pressure', blurb: 'Badges, reaction counts and the chat dock.' },
    { id: 'comments', label: 'Comments', blurb: 'Collapse threads behind one click.' },
  ];

  // One feed item, in either DOM. The handlers below stamp these; nothing
  // here is ever hidden directly by this list.
  const FEED_ITEMS = [
    '.feed-shared-update-v2',
    '[data-testid="mainFeed"] > [data-display-contents]',
    '[componentkey*="MAIN_FEED"] > [data-display-contents]',
    '[componentkey*="MAIN_FEED"] > div[role="listitem"] > [data-display-contents]',
  ].join(', ');

  // The whole feed list, in either DOM.
  const FEED_LIST = '[data-testid="mainFeed"], [componentkey*="MAIN_FEED"], main .scaffold-finite-scroll';

  // LinkedIn localises the label; this is the same set the filter lists use.
  const PROMOTED_RE = new RegExp(
    '^(Promoted|Sponsored|Anzeige|Gesponsert|Dipromosikan|Propagováno|Promoveret|Promocionado|' +
    '促銷內容|Post sponsorisé|프로모션|Post sponsorizzato|广告|プロモーション|Treść promowana|' +
    'Patrocinado|Promovat|Продвигается|Marknadsfört|Nai-promote|ได้รับการโปรโมท|' +
    'Öne çıkarılan içerik|Gepromoot|الترويج)( by .+)?$'
  );
  const SUGGESTED_RE = /^(Suggested|Recommended for you|Popular on LinkedIn)$/;

  const features = [
    // ───────────────────────── FEED ─────────────────────────
    {
      id: 'promoted_posts', group: 'feed', pages: 'all', kind: 'both', risk: 'med', since: 1, verified: 'needs-account',
      label: 'Promoted posts & ads',
      desc: 'Sponsored posts in the feed, plus ad slots and banners in the rails.',
      sel: [
        '[data-qs-promoted]',
        '[componentkey*="urn:li:sponsoredContentV2"]',
        '[data-sponsored-tracking-url]',
        'article[data-is-sponsored]',
        'li[data-is-sponsored="true"]',
        'iframe[title="Advertisement"]',
        'iframe[title="advertisement"]',
        '.ad-banner-container',
      ],
      handler: 'markPromoted',
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'suggested_posts', group: 'feed', pages: 'feed', kind: 'both', risk: 'med', since: 2, verified: 'needs-account',
      label: 'Suggested posts',
      desc: 'Posts LinkedIn injects from outside your network ("Suggested", "Recommended for you").',
      sel: ['[data-qs-suggested]'],
      handler: 'markSuggested',
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'home_feed', group: 'feed', pages: 'feed', kind: 'css', risk: 'med', since: 2, verified: 'needs-account',
      label: 'The whole feed',
      desc: 'Hides the feed itself. Posting, search, messages and jobs all still work.',
      sel: ['[data-testid="mainFeed"]', '[componentkey*="MAIN_FEED"]', 'main .scaffold-finite-scroll', '.feed-new-update-pill'],
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'feed_placeholder', group: 'feed', pages: 'feed', kind: 'js', risk: 'low', since: 2, verified: 'needs-account',
      label: 'Show a calm placeholder',
      desc: 'Puts a short question where the feed was, so the page reads as intentional, not broken.',
      handler: 'feedPlaceholder',
      modes: { light: false, deep_focus: true },
    },

    // ───────────────────────── SIDEBARS ─────────────────────────
    {
      id: 'news_sidebar', group: 'sidebar', pages: 'all', kind: 'css', risk: 'high', since: 1, verified: 'needs-account',
      label: 'LinkedIn News & puzzles',
      desc: 'The trending-stories module (and the daily games under it) in the right rail.',
      sel: ['#feed-news-module', '[data-view-name="news-module"]', '.news-module'],
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'follow_suggestions', group: 'sidebar', pages: 'all', kind: 'css', risk: 'high', since: 2, verified: 'needs-account',
      label: '"Add to your feed"',
      desc: 'Accounts LinkedIn suggests you follow, in the right rail.',
      sel: ['.feed-follows-module', '[data-view-name="feed-follows-module"]'],
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'pymk_sidebar', group: 'sidebar', pages: 'all', kind: 'css', risk: 'high', since: 1, verified: 'needs-account',
      label: '"People you may know"',
      desc: 'Connection-growth carousels in the rail and the My Network page.',
      sel: ['[data-view-name*="pymk"]', '.mn-pymk-list', '[componentkey*="pymk" i]'],
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'premium_upsells', group: 'sidebar', pages: 'all', kind: 'css', risk: 'med', since: 1, verified: 'needs-account',
      label: 'Premium & app upsells',
      desc: '"Try Premium" links, promo cards, and get-the-app banners.',
      sel: [
        'a[href*="upsellOrderOrigin"]',
        '.premium-upsell-link',
        '.update-components-promo',
        '#app-upsell-container',
        '.windows-app-upsell',
        '.upsell-bottom',
      ],
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'right_sidebar', group: 'sidebar', pages: 'all', kind: 'css', risk: 'high', since: 1, verified: 'needs-account',
      label: 'Right sidebar (all of it)',
      desc: 'Removes the whole right-hand rail, not just the modules above.',
      sel: ['aside.scaffold-layout__aside', '.scaffold-layout__aside'],
      modes: { light: false, deep_focus: true },
    },

    // ───────────────────────── SOCIAL PRESSURE ─────────────────────────
    {
      id: 'notification_badge', group: 'social', pages: 'all', kind: 'css', risk: 'high', since: 1, verified: 'needs-account',
      label: 'Unread badges',
      desc: 'The red counts on Notifications, Messaging and My Network.',
      sel: ['.notification-badge', '.notification-badge--show'],
      modes: { light: true, deep_focus: true },
    },
    {
      id: 'social_counts', group: 'social', pages: 'all', kind: 'css', risk: 'high', since: 2, verified: 'needs-account',
      label: 'Reaction & comment counts',
      desc: 'The "1,204 · 87 comments" line under posts. The buttons stay.',
      sel: ['.social-details-social-counts'],
      modes: { light: false, deep_focus: true },
    },
    {
      id: 'messaging_overlay', group: 'social', pages: 'all', kind: 'css', risk: 'high', since: 2, verified: 'needs-account',
      label: 'Chat dock',
      desc: 'The messaging pop-up pinned to the bottom corner. The Messaging page still works.',
      sel: ['#msg-overlay', '.msg-overlay-container'],
      modes: { light: false, deep_focus: true },
    },

    // ───────────────────────── COMMENTS ─────────────────────────
    {
      id: 'comment_collapse', group: 'comments', pages: 'post', kind: 'js', risk: 'high', since: 1, verified: 'needs-account',
      label: 'Collapse comments behind a button',
      desc: 'On a single post\'s page. Same escape hatch as YouTube and Reddit.',
      handler: 'collapseComments',
      modes: { light: false, deep_focus: true },
    },
  ];

  const H = {};

  /** True if `item` has a text leaf whose whole text matches `re`. */
  function hasLabel(item, re) {
    for (const el of item.querySelectorAll('span, p, div, a')) {
      if (el.children.length) continue;
      const t = el.textContent.trim();
      if (t.length < 40 && re.test(t)) return true;
    }
    return false;
  }

  /**
   * Stamp every feed item whose label matches `re` with `attr`, now and as
   * the feed grows. An item's label can hydrate after the item does, so an
   * unmatched item is re-checked, but only once its text has changed since
   * the last look — scrolling a long feed stays cheap.
   */
  function stamper(attr, re) {
    return () => {
      const { waitFor, watch, all } = globalThis.QS.dom;
      const lastLen = new WeakMap();
      const sweep = (root) => {
        for (const item of root.querySelectorAll(FEED_ITEMS)) {
          if (item.hasAttribute(attr)) continue;
          const len = item.textContent.length;
          if (lastLen.get(item) === len) continue;
          lastLen.set(item, len);
          if (hasLabel(item, re)) item.setAttribute(attr, '');
        }
      };
      let stop = () => {};
      const cancel = waitFor('main', (root) => { stop = watch(root, sweep); });
      const undo = () => {
        for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
      };
      return all(cancel, () => stop(), undo);
    };
  }

  H.markPromoted = stamper('data-qs-promoted', PROMOTED_RE);
  H.markSuggested = stamper('data-qs-suggested', SUGGESTED_RE);

  H.feedPlaceholder = () =>
    globalThis.QS.dom.placeholder(FEED_LIST, {
      id: 'qs-placeholder',
      className: 'qs-placeholder',
      text: 'What did you come here to do?',
    });

  // core/dom.js's collapseWithReveal was extracted from this exact
  // choreography — see packs/youtube.js's own collapseComments and D15.
  H.collapseComments = () =>
    globalThis.QS.dom.collapseWithReveal('.comments-comments-list, .comments-comment-list__container', {
      buttonClass: 'qs-reveal-btn',
      buttonText: 'Show comments',
    });

  // Order matters: a single post lives under /feed/update/, so `post` has to
  // be checked before `feed` claims everything under /feed.
  const pages = {
    post:          (url) => url.pathname.startsWith('/feed/update/') || url.pathname.startsWith('/posts/'),
    feed:          (url) => url.pathname === '/' || url.pathname.startsWith('/feed'),
    profile:       (url) => url.pathname.startsWith('/in/'),
    network:       (url) => url.pathname.startsWith('/mynetwork'),
    jobs:          (url) => url.pathname.startsWith('/jobs'),
    messaging:     (url) => url.pathname.startsWith('/messaging'),
    notifications: (url) => url.pathname.startsWith('/notifications'),
    search:        (url) => url.pathname.startsWith('/search'),
  };

  const modes = {
    // Generic mode names, same convention as Reddit's — see D15/D17.
    light:      { label: 'Soft block', blurb: 'Ads, suggested posts, news and upsells go. Your network\'s posts stay.' },
    deep_focus: { label: 'Hard supress', blurb: 'No feed, no rails, no chat dock. Post, search, message, apply.' },
  };

  const pack = {
    id: 'linkedin',
    label: 'LinkedIn',
    hosts: ['*://*.linkedin.com/*'],
    pages,
    groups,
    features,
    handlers: H,
    modes,
    customBaseMode: 'light',
    // No navEvents: LinkedIn's own SPA-navigation event needs a signed-in
    // session to confirm (D18). The href-poll in core/main.js covers it.
  };

  // See packs/youtube.js's export for why both `pack` and `packs` are set.
  globalThis.QS = Object.assign(globalThis.QS || {}, {
    pack,
    packs: { ...(globalThis.QS && globalThis.QS.packs), [pack.id]: pack },
  });
})();
