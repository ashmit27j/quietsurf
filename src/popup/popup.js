/**
 * Popup — progressive disclosure. Master kill switch and the current site's
 * name always show; everything else depends on whether the current tab
 * matches a pack this extension knows about.
 *
 * Loads every known pack (see popup.html) rather than just one, since the
 * popup has to work on whichever site the user happens to have open — see
 * docs/ARCHITECTURE.md "Adding a pack" for why that's a static script list
 * here rather than something discovered at runtime.
 */
(async function () {
  const QS = globalThis.QS;
  const { matchPattern } = globalThis.QSBackground;
  const REPO_ISSUES_URL = 'https://github.com/ashmit27j/quietsurf/issues/new';

  const $ = (id) => document.getElementById(id);
  const masterToggle = $('master-toggle');
  const masterText = $('master-text');
  const siteNameEl = $('site-name');
  const statusEl = $('status');
  const siteView = $('site-view');
  const unsupportedView = $('unsupported-view');
  const modesEl = $('modes');
  const blurbEl = $('blurb');
  const peekEl = $('peek');
  const requestPackEl = $('request-pack');

  let cfg = await QS.storage.load();
  const packs = QS.storage.knownPacks();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = tab?.url || '';
  const activePack = packs.find((p) => p.hosts.some((h) => matchPattern(h, tabUrl)));

  let site = activePack ? cfg.sites[activePack.id] : null;
  const MODES = activePack ? ['off', ...Object.keys(activePack.modes), 'custom'] : [];
  const MODE_META = activePack
    ? { off: QS.storage.OFF_META, ...activePack.modes, custom: QS.storage.CUSTOM_META }
    : {};

  // D21: a site's stored mode defaults to its pack's baseline ('light') the
  // moment it is first seen, long before its host permission is granted. The
  // popup used to show that stored mode as active, so a never-enabled site
  // looked switched on while nothing was injected, and because "Light" already
  // looked selected, nobody clicked it, so the permission prompt never came.
  // What the popup shows is now the EFFECTIVE mode: 'off' until granted.
  const hasAccess = () =>
    activePack ? chrome.permissions.contains({ origins: activePack.hosts }) : Promise.resolve(false);
  let granted = await hasAccess();

  function hostnameOf(url) {
    try { return new URL(url).hostname; } catch { return 'this site'; }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  async function onPickMode(m) {
    // D16: the pack is inert until its host permission is granted. Ask the
    // first time the user picks anything other than Off — this click is the
    // user gesture chrome.permissions.request() requires. The service
    // worker's onAdded listener registers and injects the pack once granted.
    if (m !== 'off' && !granted) {
      granted = await chrome.permissions.request({ origins: activePack.hosts }).catch(() => false);
      if (!granted) return render(); // declined — leave the mode untouched
    }
    site.mode = m;
    await QS.storage.save({ sites: cfg.sites, peekUntil: 0 });
    render();
  }

  function setStatus(state, text) {
    statusEl.hidden = false;
    statusEl.dataset.state = state;
    const dot = document.createElement('span');
    dot.className = 'dot';
    statusEl.replaceChildren(dot, text);
  }

  function render() {
    const masterOn = cfg.masterEnabled !== false;
    masterToggle.checked = masterOn;
    masterText.textContent = masterOn ? 'On' : 'Off';

    if (!activePack) {
      siteNameEl.textContent = hostnameOf(tabUrl);
      statusEl.hidden = true;
      siteView.hidden = true;
      unsupportedView.hidden = false;
      peekEl.hidden = true;
      requestPackEl.href =
        `${REPO_ISSUES_URL}?title=${encodeURIComponent(`Add a pack for ${hostnameOf(tabUrl)}`)}`;
      return;
    }

    siteNameEl.textContent = activePack.label;
    siteView.hidden = false;
    unsupportedView.hidden = true;
    peekEl.hidden = false;

    const stored = QS.storage.activeMode(cfg, Date.now(), activePack);
    const active = granted ? stored : 'off';

    if (!masterOn) setStatus('off', 'Paused everywhere');
    else if (!granted) setStatus('needs-access', 'Not enabled here — pick a mode');
    else if (active === 'off') setStatus('off', 'Off on this site');
    else setStatus('on', `Active · ${MODE_META[active].label}`);

    modesEl.replaceChildren(
      ...MODES.filter((m) => m !== 'custom' || Object.keys(site.custom || {}).length).map((m) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.role = 'radio';
        b.textContent = MODE_META[m].label;
        b.setAttribute('aria-checked', String(m === active));
        b.addEventListener('click', () => onPickMode(m));
        b.addEventListener('mouseenter', () => { blurbEl.textContent = MODE_META[m].blurb; });
        b.addEventListener('mouseleave', () => { blurbEl.textContent = MODE_META[active].blurb; });
        return b;
      })
    );
    blurbEl.textContent = granted
      ? MODE_META[active].blurb
      : `Chrome will ask for access to ${hostnameOf(tabUrl)} the first time you pick a mode. Nothing leaves your browser.`;
    if (granted && cfg.schedule?.enabled && active !== site.mode) {
      blurbEl.textContent = `Scheduled: ${MODE_META[active].label} is active right now. ${MODE_META[active].blurb}`;
    }

    const peeking = (cfg.peekUntil || 0) > Date.now();
    peekEl.dataset.active = peeking ? '1' : '0';
    peekEl.textContent = peeking ? 'End peek' : 'Peek 30s';
    peekEl.disabled = !granted || active === 'off' || !masterOn;
  }

  masterToggle.addEventListener('change', async () => {
    cfg.masterEnabled = masterToggle.checked;
    await QS.storage.save({ masterEnabled: cfg.masterEnabled });
    render();
  });

  peekEl.addEventListener('click', async () => {
    const peeking = (cfg.peekUntil || 0) > Date.now();
    cfg.peekUntil = peeking ? 0 : Date.now() + 30_000;
    await QS.storage.save({ peekUntil: cfg.peekUntil });
    render();
  });

  $('open-options').addEventListener('click', openOptions);

  chrome.storage.onChanged.addListener(async () => {
    cfg = await QS.storage.load();
    if (activePack) site = cfg.sites[activePack.id];
    render();
  });

  // A grant/revoke from chrome://extensions or the options page while the
  // popup is open.
  const onPerms = async () => { granted = await hasAccess(); render(); };
  chrome.permissions.onAdded.addListener(onPerms);
  chrome.permissions.onRemoved.addListener(onPerms);

  render();
})();
