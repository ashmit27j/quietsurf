/**
 * Pack behaviour tests — offline, no network. tests/engine.spec.js proves the
 * CSS engine hides each registry selector; this file covers what that can't:
 * each pack's own page classification and its JS handlers, run for real in a
 * page against synthetic markup shaped like the site's DOM (D21).
 *
 * As with engine.spec.js, this tests OUR code, not the live site's markup.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const domSrc = src('core/dom.js');
const engineSrc = src('core/engine.js');

function loadPack(id) {
  new Function(src(`packs/${id}.js`))();
  return globalThis.QS.pack;
}

function classify(pack, path) {
  const url = new URL(`https://www.example.com${path}`);
  for (const [name, t] of Object.entries(pack.pages)) if (t(url)) return name;
  return 'other';
}

/** Serve `body` on the pack's real origin (fulfilled locally), then load core + pack. */
async function boot(page, id, body, flags = null) {
  const pack = loadPack(id);
  const origin = pack.hosts[0].replace(/^\*:\/\/\*\./, 'https://www.').replace(/\/\*$/, '/');
  await page.route('**/*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head></head><body>${body}</body></html>` })
  );
  await page.goto(origin);
  await page.addScriptTag({ content: domSrc });
  await page.addScriptTag({ content: src(`packs/${id}.js`) });
  if (flags) {
    await page.evaluate((f) => localStorage.setItem('qs:flags:v1', JSON.stringify(f)), flags);
    await page.addScriptTag({ content: engineSrc });
  }
}

test.describe('page classification', () => {
  test('reddit: every algorithmic listing is "home", a subreddit is not', () => {
    const p = loadPack('reddit');
    for (const path of ['/', '/best/', '/hot', '/new/', '/top/', '/r/popular/', '/r/all']) {
      expect(classify(p, path), path).toBe('home');
    }
    expect(classify(p, '/r/programming/')).toBe('subreddit');
    expect(classify(p, '/r/programming/comments/abc123/some_title/')).toBe('comments');
    expect(classify(p, '/search/?q=x')).toBe('search');
    expect(classify(p, '/user/someone/')).toBe('user');
  });

  test('linkedin: a single post is "post", not swallowed by "feed"', () => {
    const p = loadPack('linkedin');
    expect(classify(p, '/feed/')).toBe('feed');
    expect(classify(p, '/')).toBe('feed');
    expect(classify(p, '/feed/update/urn:li:activity:123/')).toBe('post');
    expect(classify(p, '/posts/someone_title-activity-123/')).toBe('post');
    expect(classify(p, '/mynetwork/')).toBe('network');
    expect(classify(p, '/in/someone/')).toBe('profile');
  });
});

test.describe('linkedin: promoted / suggested stamping', () => {
  const OLD_DOM = `<main>
    <div class="feed-shared-update-v2" id="ad"><span class="actor">Acme Corp</span><span>Promoted</span><p>Buy our thing.</p></div>
    <div class="feed-shared-update-v2" id="organic"><span class="actor">Jane</span><p>I got Promoted to VP today!</p></div>
    <div class="feed-shared-update-v2" id="sugg"><span>Suggested</span><p>A stranger's post.</p></div>
  </main>`;

  const NEW_DOM = `<main><div data-testid="mainFeed">
    <div data-display-contents="true" id="ad"><div><p>Acme Corp</p><p>Promoted by Acme Corp</p></div></div>
    <div data-display-contents="true" id="organic"><div><p>Jane</p><p>Hello network</p></div></div>
    <div data-display-contents="true" id="de"><div><p>Firma</p><p>Gesponsert</p></div></div>
  </div></main>`;

  test('stamps promoted posts in the class-name DOM, and only those', async ({ page }) => {
    await boot(page, 'linkedin', OLD_DOM);
    await page.evaluate(() => { globalThis.cleanup = globalThis.QS.pack.handlers.markPromoted(); });
    expect(await page.locator('#ad[data-qs-promoted]').count()).toBe(1);
    expect(await page.locator('#organic[data-qs-promoted]').count(), 'body text mentioning "Promoted" is not a label').toBe(0);
    expect(await page.locator('#sugg[data-qs-promoted]').count()).toBe(0);
  });

  test('stamps promoted posts in the new componentkey DOM, in other languages too', async ({ page }) => {
    await boot(page, 'linkedin', NEW_DOM);
    await page.evaluate(() => { globalThis.QS.pack.handlers.markPromoted(); });
    expect(await page.locator('#ad[data-qs-promoted]').count()).toBe(1);
    expect(await page.locator('#de[data-qs-promoted]').count()).toBe(1);
    expect(await page.locator('#organic[data-qs-promoted]').count()).toBe(0);
  });

  test('catches posts that arrive later, and labels that hydrate after their post', async ({ page }) => {
    await boot(page, 'linkedin', NEW_DOM);
    await page.evaluate(() => { globalThis.QS.pack.handlers.markPromoted(); });
    await page.evaluate(() => {
      const feed = document.querySelector('[data-testid="mainFeed"]');
      feed.insertAdjacentHTML('beforeend', '<div data-display-contents="true" id="late"><div><p>Late Co</p><p>Promoted</p></div></div>');
      feed.insertAdjacentHTML('beforeend', '<div data-display-contents="true" id="slow"><div><p>Slow Co</p></div></div>');
    });
    await expect(page.locator('#late[data-qs-promoted]')).toHaveCount(1);
    await page.evaluate(() => document.querySelector('#slow > div').insertAdjacentHTML('beforeend', '<p>Promoted</p>'));
    await expect(page.locator('#slow[data-qs-promoted]')).toHaveCount(1);
  });

  test('suggested posts are stamped separately', async ({ page }) => {
    await boot(page, 'linkedin', OLD_DOM);
    await page.evaluate(() => { globalThis.QS.pack.handlers.markSuggested(); });
    expect(await page.locator('#sugg[data-qs-suggested]').count()).toBe(1);
    expect(await page.locator('[data-qs-suggested]').count()).toBe(1);
  });

  test('cleanup removes every stamp and stops watching', async ({ page }) => {
    await boot(page, 'linkedin', OLD_DOM);
    await page.evaluate(() => {
      const stop = globalThis.QS.pack.handlers.markPromoted();
      stop();
      document.querySelector('main').insertAdjacentHTML('beforeend', '<div class="feed-shared-update-v2" id="after"><span>Promoted</span></div>');
    });
    await page.waitForTimeout(400);
    expect(await page.locator('[data-qs-promoted]').count()).toBe(0);
  });

  test('a stamped post is actually hidden by the engine\'s CSS', async ({ page }) => {
    await boot(page, 'linkedin', OLD_DOM, { promoted_posts: true });
    await page.evaluate(() => { globalThis.QS.pack.handlers.markPromoted(); });
    expect(await page.locator('#ad').isHidden()).toBe(true);
    expect(await page.locator('#organic').isVisible()).toBe(true);
  });
});

test.describe('feed placeholders', () => {
  test('reddit: the placeholder lands right before the hidden feed, once', async ({ page }) => {
    await boot(page, 'reddit', '<div id="main"><shreddit-feed><article>post</article></shreddit-feed></div>');
    await page.evaluate(() => {
      const h = globalThis.QS.pack.handlers;
      h.homePlaceholder();
      h.homePlaceholder(); // handlers must be idempotent (re-run on every nav)
    });
    expect(await page.locator('#qs-placeholder').count()).toBe(1);
    expect(await page.evaluate(() => document.querySelector('shreddit-feed').previousElementSibling?.id)).toBe('qs-placeholder');
  });

  test('linkedin: placeholder works for the new feed DOM and cleans up', async ({ page }) => {
    await boot(page, 'linkedin', '<main><div class="share-box"></div><div data-testid="mainFeed"></div></main>');
    const after = await page.evaluate(() => {
      const stop = globalThis.QS.pack.handlers.feedPlaceholder();
      const had = !!document.getElementById('qs-placeholder');
      stop();
      return { had, gone: !document.getElementById('qs-placeholder') };
    });
    expect(after).toEqual({ had: true, gone: true });
  });
});

test.describe('comment collapse', () => {
  test('reddit: the comment tree collapses behind a working button', async ({ page }) => {
    await boot(page, 'reddit', '<div><shreddit-comment-tree id="tree">comments</shreddit-comment-tree></div>');
    await page.evaluate(() => globalThis.QS.pack.handlers.collapseComments());
    expect(await page.locator('#tree').isHidden()).toBe(true);
    await page.locator('.qs-reveal-btn').click();
    expect(await page.locator('#tree').isVisible()).toBe(true);
  });
});
