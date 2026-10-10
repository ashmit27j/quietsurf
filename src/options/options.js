/**
 * Options page. Every control here is GENERATED from each known pack's
 * registry — adding a feature to a pack makes it appear here automatically,
 * with no edit to this file. That is the point of the registry; keep it that
 * way. Grouped by site (see options.html, which loads every pack) rather
 * than the single-pack rendering this file used before step 6.
 */
(async function () {
  const QS = globalThis.QS;
  const packs = QS.storage.knownPacks();
  let cfg = await QS.storage.load();

  const $ = (id) => document.getElementById(id);
  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Which site cards are expanded. Not persisted — every card starts
  // collapsed on open, and this only needs to survive re-renders triggered
  // by the user's own clicks within this one page session.
  const expanded = new Set();

  // Group-blocks default to collapsed (like the site cards themselves); this
  // tracks the ones a user has explicitly expanded, keyed `${packId}:${groupId}`.
  // Same not-persisted, session-only reasoning as `expanded` above.
  const expandedGroups = new Set();

  // Which sites have their host permission. A site with no grant is inert
  // (D16) whatever its stored mode says, so cards show the EFFECTIVE mode,
  // 'off', until it is granted — see popup.js for the bug this fixes (D21).
  const granted = {};
  async function refreshGrants() {
    for (const pack of packs) {
      granted[pack.id] = await chrome.permissions.contains({ origins: pack.hosts });
    }
  }
  await refreshGrants();

  function tag(text, cls = '', title = '') {
    const t = document.createElement('span');
    t.className = `tag ${cls}`.trim();
    t.textContent = text;
    if (title) t.title = title;
    return t;
  }

  async function persistSites() {
    await QS.storage.save({ sites: cfg.sites });
  }

  // ── master switch ───────────────────────────────────────────────────────
  const masterToggle = $('master-toggle');
  masterToggle.checked = cfg.masterEnabled !== false;
  masterToggle.addEventListener('change', async () => {
    cfg.masterEnabled = masterToggle.checked;
    await QS.storage.save({ masterEnabled: cfg.masterEnabled });
    renderAll();
  });

  // ── one card per known pack ─────────────────────────────────────────────
  function renderSites() {
    const host = $('sites');
    host.replaceChildren();

    packs.forEach((pack, packIndex) => {
      const site = cfg.sites[pack.id];
      const MODES = ['off', ...Object.keys(pack.modes), 'custom'];
      const MODE_META = { off: QS.storage.OFF_META, ...pack.modes, custom: QS.storage.CUSTOM_META };
      const hasAccess = granted[pack.id];
      const stored = QS.storage.activeMode(cfg, Date.now(), pack);
      const active = hasAccess ? stored : 'off';
      const { flags } = hasAccess
        ? QS.storage.resolve(cfg, Date.now(), pack)
        : { flags: QS.storage.defaultsFor(pack, 'off') };

      const card = document.createElement('section');
      card.className = 'card site-card rule';
      card.innerHTML = '<span class="tick bl" aria-hidden="true"></span><span class="tick br" aria-hidden="true"></span>';
      const isExpanded = expanded.has(pack.id);

      const head = document.createElement('div');
      head.className = 'card-head site-head';

      const left = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'site-meta';
      const idx = document.createElement('span');
      idx.className = 'hud faint';
      idx.textContent = `Site ${String(packIndex + 1).padStart(2, '0')}`;
      meta.append(idx);
      if (cfg.masterEnabled === false) meta.append(tag('Paused', '', 'QuietSurf is switched off everywhere.'));
      else if (!hasAccess) meta.append(tag('Not enabled', 'warn', 'Pick a mode — Chrome will ask for access to this site once.'));
      else if (active === 'off') meta.append(tag('Off'));
      else {
        const t = tag(`Active · ${MODE_META[active].label}`, 'ok');
        const dot = document.createElement('span');
        dot.className = 'dot';
        t.prepend(dot);
        meta.append(t);
      }
      const h2 = document.createElement('h2');
      h2.textContent = pack.label;
      const blurb = document.createElement('p');
      blurb.className = 'muted';
      blurb.textContent = hasAccess
        ? MODE_META[active].blurb
        : `Inactive until you pick a mode. Chrome will ask once for access to ${pack.label}; nothing leaves your browser.`;
      left.append(meta, h2, blurb);

      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'btn ghost expand-btn';
      expandBtn.setAttribute('aria-expanded', String(isExpanded));
      expandBtn.setAttribute('aria-label', `${isExpanded ? 'Collapse' : 'Expand'} ${pack.label} toggles`);
      expandBtn.innerHTML = '<span>Toggles</span><span class="chev" aria-hidden="true">+</span>';
      expandBtn.onclick = () => {
        if (isExpanded) expanded.delete(pack.id);
        else expanded.add(pack.id);
        renderSites();
      };

      head.append(left, expandBtn);
      card.append(head);

      // modes
      const modesEl = document.createElement('div');
      modesEl.className = 'modes';
      modesEl.setAttribute('role', 'radiogroup');
      modesEl.setAttribute('aria-label', `${pack.label} mode`);
      for (const m of MODES) {
        if (m === 'custom' && !Object.keys(site.custom || {}).length) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.role = 'radio';
        b.textContent = MODE_META[m].label;
        b.title = MODE_META[m].blurb;
        b.setAttribute('aria-checked', String(m === active));
        b.onclick = async () => {
          // D16: the pack is inert until its host permission is granted. Ask
          // the first time the user picks anything other than Off for it.
          if (m !== 'off' && !granted[pack.id]) {
            granted[pack.id] = await chrome.permissions.request({ origins: pack.hosts }).catch(() => false);
            if (!granted[pack.id]) return;
          }
          site.mode = m;
          await persistSites();
          renderAll();
        };
        modesEl.append(b);
      }
      card.append(modesEl);

      const overrideCount = Object.keys(site.overrides || {}).length;
      if (overrideCount && hasAccess) {
        const note = document.createElement('p');
        note.className = 'note';
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn ghost';
        clearBtn.textContent = 'Clear';
        clearBtn.onclick = async () => {
          site.overrides = {};
          await persistSites();
          renderAll();
        };
        note.append(
          tag(`${overrideCount} override${overrideCount === 1 ? '' : 's'}`),
          'Toggles changed away from the mode\'s defaults.',
          clearBtn
        );
        card.append(note);
      }

      // feature toggles, grouped — collapsed by default (see `expanded` above)
      const groupsHost = document.createElement('div');
      groupsHost.className = 'groups';
      groupsHost.hidden = !isExpanded;
      for (const g of pack.groups) {
        const items = pack.features.filter((f) => f.group === g.id);
        if (!items.length) continue;

        const block = document.createElement('div');
        block.className = 'group-block';

        const groupKey = `${pack.id}:${g.id}`;
        const isGroupExpanded = expandedGroups.has(groupKey);

        // The whole header row is the disclosure button — a bigger target
        // than the old lone chevron.
        const gHead = document.createElement('button');
        gHead.type = 'button';
        gHead.className = 'group-head';
        gHead.setAttribute('aria-expanded', String(isGroupExpanded));
        const gLeft = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.textContent = g.label;
        const gp = document.createElement('p');
        gp.textContent = g.blurb;
        gLeft.append(h3, gp);
        const count = document.createElement('span');
        count.className = 'count hud';
        const onCount = items.filter((f) => flags[f.id]).length;
        count.innerHTML = `<span>${onCount}/${items.length}</span><span class="chev" aria-hidden="true">+</span>`;
        gHead.append(gLeft, count);
        gHead.onclick = () => {
          if (isGroupExpanded) expandedGroups.delete(groupKey);
          else expandedGroups.add(groupKey);
          renderSites();
        };
        block.append(gHead);

        const itemsHost = document.createElement('div');
        itemsHost.className = 'group-items';
        itemsHost.hidden = !isGroupExpanded;

        for (const f of items) {
          const overridden = hasAccess && f.id in (site.overrides || {});
          const row = document.createElement('div');
          row.className = 'feat';
          row.dataset.overridden = overridden ? '1' : '0';

          const sw = document.createElement('label');
          sw.className = 'sw';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = !!flags[f.id];
          // A toggle on a site with no access would only record an override
          // that does nothing — pick a mode first (D21).
          input.disabled = !hasAccess;
          input.setAttribute('aria-label', f.label);
          input.onchange = async () => {
            // A click that lands back on the mode's own default isn't an
            // override any more — clear it instead of recording a no-op
            // override that would sit there forever (it never re-derives
            // from the mode, so it silently pins that one toggle even
            // after the user picks a different mode later).
            const base = active === 'custom'
              ? !!Object.assign(QS.storage.defaultsFor(pack, pack.customBaseMode), site.custom)[f.id]
              : !!QS.storage.defaultsFor(pack, active)[f.id];
            site.overrides = site.overrides || {};
            if (input.checked === base) delete site.overrides[f.id];
            else site.overrides[f.id] = input.checked;
            await persistSites();
            renderAll();
          };
          const track = document.createElement('span');
          track.className = 'sw-track';
          sw.append(input, track);

          const txt = document.createElement('div');
          txt.className = 'txt';
          const label = document.createElement('div');
          label.className = 'label';
          label.append(f.label);
          if (overridden) label.append(tag('Overridden'));
          if (f.risk === 'high') {
            label.append(tag('Fragile', '', 'Depends on a class name — most likely toggle to break after a redesign.'));
          }
          if (f.verified === 'needs-account') {
            label.append(tag('Needs account', '', 'Only exists when signed in — the live selector audit cannot verify this from a signed-out browser.'));
          }
          const desc = document.createElement('div');
          desc.className = 'desc';
          desc.textContent = f.desc;
          txt.append(label, desc);

          row.append(sw, txt);
          itemsHost.append(row);
        }
        block.append(itemsHost);
        groupsHost.append(block);
      }
      card.append(groupsHost);
      host.append(card);
    });
  }

  // ── schedule ─────────────────────────────────────────────────────────────
  // Global, not per-site (see docs/ARCHITECTURE.md): one set of time windows
  // applies across every site. Its mode dropdown necessarily comes from ONE
  // pack's vocabulary — the first known pack, by the same convention
  // core/storage.js's schema-1 migration uses (see docs/DECISIONS.md D17).
  const schedulePack = packs[0];
  $('sched-pack-name').textContent = schedulePack.label;
  const SCHED_MODES = ['off', ...Object.keys(schedulePack.modes), 'custom'];
  const SCHED_MODE_META = { off: QS.storage.OFF_META, ...schedulePack.modes, custom: QS.storage.CUSTOM_META };
  const schedDefaultMode = Object.keys(schedulePack.modes).at(-1); // the pack's own most-aggressive mode

  function renderSchedule() {
    const s = (cfg.schedule = cfg.schedule || { enabled: false, rules: [] });
    $('sched-enabled').checked = !!s.enabled;

    const host = $('sched-rules');
    host.replaceChildren();
    s.rules.forEach((rule, i) => {
      const row = document.createElement('div');
      row.className = 'sched-rule';

      const days = document.createElement('div');
      days.className = 'days';
      DAYS.forEach((d, di) => {
        const l = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = (rule.days || []).includes(di);
        cb.onchange = () => {
          rule.days = rule.days || [];
          if (cb.checked) rule.days.push(di);
          else rule.days = rule.days.filter((x) => x !== di);
          persistSchedule();
        };
        const sp = document.createElement('span');
        sp.textContent = d;
        l.append(cb, sp);
        days.append(l);
      });

      const from = document.createElement('input');
      from.type = 'time';
      from.value = rule.from || '09:00';
      from.onchange = () => { rule.from = from.value; persistSchedule(); };

      const to = document.createElement('input');
      to.type = 'time';
      to.value = rule.to || '17:00';
      to.onchange = () => { rule.to = to.value; persistSchedule(); };

      const sel = document.createElement('select');
      SCHED_MODES.forEach((m) => {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = SCHED_MODE_META[m].label;
        o.selected = rule.mode === m;
        sel.append(o);
      });
      sel.onchange = () => { rule.mode = sel.value; persistSchedule(); };

      const timeRange = document.createElement('div');
      timeRange.className = 'sched-time-range';
      timeRange.append(from, document.createTextNode('→'), to);

      const controls = document.createElement('div');
      controls.className = 'sched-rule-controls';
      controls.append(timeRange, sel);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn ghost sched-remove';
      del.setAttribute('aria-label', 'Remove this schedule rule');
      del.title = 'Remove this schedule rule';
      del.textContent = '×';
      del.onclick = () => { s.rules.splice(i, 1); persistSchedule(); renderAll(); };

      row.append(days, controls, del);
      host.append(row);
    });
  }

  async function persistSchedule() {
    await QS.storage.save({ schedule: cfg.schedule });
    renderSites();
  }

  $('sched-enabled').onchange = async (e) => {
    cfg.schedule.enabled = e.target.checked;
    await persistSchedule();
  };

  $('sched-add').onclick = async () => {
    cfg.schedule.rules.push({ days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00', mode: schedDefaultMode });
    await persistSchedule();
    renderAll();
  };

  // ── backup ──────────────────────────────────────────────────────────────
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quietsurf-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $('import').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = async () => {
      const text = await inp.files[0].text();
      try {
        const incoming = JSON.parse(text);
        await QS.storage.save(incoming);
        cfg = await QS.storage.load();
        renderAll();
      } catch {
        alert('That file is not valid QuietSurf settings.');
      }
    };
    inp.click();
  };

  $('reset').onclick = async () => {
    if (!confirm('Restore every setting to its default?')) return;
    await (chrome.storage.sync || chrome.storage.local).clear();
    await QS.storage.save(QS.storage.DEFAULTS);
    cfg = await QS.storage.load();
    renderAll();
  };

  function renderAll() {
    masterToggle.checked = cfg.masterEnabled !== false;
    $('master-text').textContent = masterToggle.checked ? 'Enabled' : 'Paused';
    renderSites();
    renderSchedule();
  }

  // A grant or revoke from the popup, or from chrome://extensions, while this
  // page is open.
  const onPerms = async () => { await refreshGrants(); renderSites(); };
  chrome.permissions.onAdded.addListener(onPerms);
  chrome.permissions.onRemoved.addListener(onPerms);

  renderAll();
})();
