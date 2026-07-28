(function () {
  'use strict';

  const root = document.getElementById('app-root');
  const WEBSITE_URL = 'https://www.hgsi.in/';
  let schema = null;
  let state = { view: 'home', filter: 'all', index: [], current: null, originalString: null };

  // ---------------- API helpers ----------------

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    if (!res.ok) throw new Error('API error ' + res.status + ' on ' + path);
    return res.json();
  }
  const loadSchema = () => api('/api/schema');
  const loadIndex = () => api('/api/submissions');
  const loadSubmission = async (id) => {
    if (state.isOffline) {
      const stored = localStorage.getItem('wfj_sub_' + id);
      return stored ? JSON.parse(stored) : { id, type: 'crf', header: {}, body: {}, tasks: [] };
    }
    return api('/api/submissions/' + id);
  };
  const createSubmission = async (type) => {
    if (state.isOffline) {
      const id = Date.now();
      const newSub = { id, type, status: 'draft', client: 'New Client', broker: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), header: {}, body: {}, tasks: [] };
      localStorage.setItem('wfj_sub_' + id, JSON.stringify(newSub));
      state.index.unshift(newSub);
      localStorage.setItem('wfj_offline_index', JSON.stringify(state.index));
      return newSub;
    }
    return api('/api/submissions', { method: 'POST', body: JSON.stringify({ type, status: 'draft' }) });
  };
  const patchSubmission = async (id, patch) => {
    if (state.isOffline) {
      const stored = localStorage.getItem('wfj_sub_' + id);
      let sub = stored ? JSON.parse(stored) : { id };
      Object.assign(sub, patch);
      sub.updated_at = new Date().toISOString();
      localStorage.setItem('wfj_sub_' + id, JSON.stringify(sub));
      const idxItem = state.index.find(x => String(x.id) === String(id));
      if (idxItem) Object.assign(idxItem, patch);
      localStorage.setItem('wfj_offline_index', JSON.stringify(state.index));
      return sub;
    }
    return api('/api/submissions/' + id, { method: 'PUT', body: JSON.stringify(patch) });
  };
  const removeSubmissionApi = async (id) => {
    if (state.isOffline) {
      localStorage.removeItem('wfj_sub_' + id);
      state.index = state.index.filter(x => String(x.id) !== String(id));
      localStorage.setItem('wfj_offline_index', JSON.stringify(state.index));
      return { success: true };
    }
    return api('/api/submissions/' + id, { method: 'DELETE' });
  };

  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d; } }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function cleanSubmission(sub) {
    if (!sub) return null;
    return {
      client: sub.client || '',
      broker: sub.broker || '',
      status: sub.status || 'requested',
      header: JSON.parse(JSON.stringify(sub.header || {})),
      body: JSON.parse(JSON.stringify(sub.body || {})),
      tasks: (sub.tasks || []).map(t => ({
        id: t.id,
        section_key: t.section_key,
        item_key: t.item_key,
        label: t.label,
        status: t.status,
        completed_on: t.completed_on,
        notes: t.notes,
        extra_json: JSON.parse(JSON.stringify(t.extra_json || {}))
      }))
    };
  }

  function isSubmissionDirty() {
    if (!state.current) return false;
    return JSON.stringify(cleanSubmission(state.current)) !== state.originalString;
  }

  function checkUnsavedChanges() {
    if (isSubmissionDirty()) {
      return confirm('You have unsaved changes. Are you sure you want to discard them?');
    }
    return true;
  }

  window.addEventListener('beforeunload', (e) => {
    if (isSubmissionDirty()) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }
  });

  function setSaveState(s) {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    if (s === 'saving') {
      el.textContent = 'Saving…';
      el.className = 'save-indicator saving';
    } else if (s === 'saved') {
      el.textContent = 'Saved';
      el.className = 'save-indicator saved';
    } else if (s === 'unsaved' || isSubmissionDirty()) {
      el.textContent = 'Unsaved Changes';
      el.className = 'save-indicator unsaved';
    } else {
      el.textContent = '';
      el.className = 'save-indicator';
    }
  }

  function wireSaveButton(main, sub) {
    const btn = main.querySelector('#save-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.textContent = 'Saving…'; btn.disabled = true;
      setSaveState('saving');
      try {
        if (sub.status === 'draft') sub.status = 'requested';
        const saved = await patchSubmission(sub.id, cleanSubmission(sub));
        state.current = saved;
        state.originalString = JSON.stringify(cleanSubmission(saved));
        setSaveState('saved');
        btn.textContent = 'Saved ✓';
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1400);
      } catch (err) {
        alert('Save failed: ' + err.message);
        btn.textContent = 'Save'; btn.disabled = false;
        setSaveState('unsaved');
      }
    });
  }

  // ---------------- Navigation ----------------

  async function goView(v) {
    if (!checkUnsavedChanges()) return;
    state.view = v; state.current = null; state.index = await loadIndex(); render();
  }
  async function openSubmission(id) {
    if (!checkUnsavedChanges()) return;
    try {
      const sub = await loadSubmission(id);
      if (!sub || sub.error) {
        alert('Submission not found or already deleted.');
        state.index = await loadIndex();
        state.view = 'submissions';
        state.current = null;
        render();
        return;
      }
      state.current = sub;
      state.originalString = JSON.stringify(cleanSubmission(state.current));
      state.view = state.current.type;
      render();
    } catch (err) {
      alert('Could not open submission: ' + err.message);
    }
  }
  async function createNew(type) {
    if (!checkUnsavedChanges()) return;
    state.current = await createSubmission(type);
    
    const today = new Date().toISOString().slice(0, 10);
    if (!state.current.header) state.current.header = {};
    if (!state.current.body) state.current.body = {};
    
    if (type === 'crf') {
      if (!state.current.body.request) state.current.body.request = {};
      state.current.body.request.dateOfRequest = today;
    } else if (type === 'termination') {
      state.current.header.requestedDate = today;
    }

    state.originalString = JSON.stringify(cleanSubmission(state.current));
    state.view = type;
    state.index = await loadIndex();
    render();
  }
  async function removeSubmission(id, evt) {
    if (evt) evt.stopPropagation();
    if (!confirm('Delete this submission? This cannot be undone.')) return;
    try {
      await removeSubmissionApi(id);
      if (state.current && String(state.current.id) === String(id)) {
        state.current = null;
        state.view = 'submissions';
      }
      state.index = await loadIndex();
      render();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  // ---------------- Shell ----------------

  function render() {
    const totalCount = state.index.length;
    const completedCount = state.index.filter(x => x.status === 'completed').length;
    root.innerHTML = `
      <div class="topbar">
        <button class="mobile-menu-btn" id="mobile-menu-btn">&#9776;</button>
        <img class="brand-logo" src="images/logo.png" alt="Workforce Junction">
        <div class="topbar-spacer"></div>
        <div class="notif-bell" id="notif-bell" title="Notifications">
          &#128276;
          <div class="notif-badge" id="notif-badge" style="display:none;">0</div>
          <div class="notif-dropdown" id="notif-dropdown">
            <div class="notif-header">Recent Requests <span style="font-size:11px;font-weight:400;color:var(--ink-soft);cursor:pointer;" id="notif-clear">Dismiss All</span></div>
            <div id="notif-list"></div>
          </div>
        </div>
        <div class="save-indicator" id="save-indicator"></div>
      </div>
      <div class="app-body">
        <div class="nav-backdrop" id="nav-backdrop"></div>
        <nav class="site-nav" id="site-nav">
          <div class="nav-group-label">Workspace</div>
          <div class="nav-item ${state.view === 'home' ? 'active' : ''}" data-goto="home">${navIcon('&#8962;')} Home</div>
          <div class="nav-item ${state.view === 'dashboard' ? 'active' : ''}" data-goto="dashboard">${navIcon('&#128202;')} Dashboard</div>
          <div class="nav-item ${state.view === 'submissions' ? 'active' : ''}" data-goto="submissions">${navIcon('&#128203;')} All Submissions<span class="nav-count">${totalCount}</span></div>
          <div class="nav-item ${state.view === 'completed' ? 'active' : ''}" data-goto="completed">${navIcon('&#9989;')} Completed<span class="nav-count">${completedCount}</span></div>
          <div class="nav-group-label">Tools</div>
          <div class="nav-item ${state.view === 'notifications' ? 'active' : ''}" data-goto="notifications">${navIcon('&#128276;')} Notifications</div>
          <div class="nav-item ${state.view === 'tracker' ? 'active' : ''}" data-goto="tracker">${navIcon('&#128200;')} Tracker</div>
          <div class="nav-group-label">Create</div>
          <div class="nav-item" data-newtype="crf">${navIcon('&#9998;')} New CRF</div>
          <div class="nav-item" data-newtype="termination">${navIcon('&#9989;')} New Termination Checklist</div>
          <div class="nav-item" data-newtype="implementation">${navIcon('&#127959;')} New Implementation Checklist</div>
        </nav>

        <div class="main-area" id="main-area"></div>
      </div>
      ${footerHtml()}
    `;
    root.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { closeMobileNav(); goView(el.dataset.goto); }));
    root.querySelectorAll('[data-newtype]').forEach(el => el.addEventListener('click', () => { closeMobileNav(); createNew(el.dataset.newtype); }));
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('site-nav').classList.add('open');
      document.getElementById('nav-backdrop').classList.add('open');
    });
    document.getElementById('nav-backdrop').addEventListener('click', closeMobileNav);
    
    // Notifications Logic
    const requestedItems = state.index.filter(x => x.status === 'requested');
    const notifBadge = document.getElementById('notif-badge');
    const notifDropdown = document.getElementById('notif-dropdown');
    const notifList = document.getElementById('notif-list');
    
    if (requestedItems.length > 0) {
      notifBadge.textContent = requestedItems.length;
      notifBadge.style.display = 'block';
    }
    
    notifList.innerHTML = requestedItems.length === 0 ? '<div class="notif-empty">No new requests</div>' : requestedItems.map(r => `
      <div class="notif-item" data-notif-open="${r.id}">
        <div class="notif-item-title">${typeLabelOf(r.type)}: ${esc(r.client || 'Untitled')}</div>
        <div class="notif-item-meta">Updated: ${fmtDate(r.updatedAt)}</div>
      </div>
    `).join('');
    
    document.getElementById('notif-bell').addEventListener('click', (e) => {
      if (e.target.closest('#notif-dropdown') && !e.target.closest('#notif-clear')) return;
      notifDropdown.classList.toggle('open');
    });
    
    document.getElementById('notif-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.remove('open');
      notifBadge.style.display = 'none';
      notifList.innerHTML = '<div class="notif-empty">No new requests</div>';
    });
    
    notifList.querySelectorAll('[data-notif-open]').forEach(el => el.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.remove('open');
      openSubmission(el.dataset.notifOpen);
    }));

    const main = document.getElementById('main-area');
    if (state.view === 'home') renderHome(main);
    else if (state.view === 'dashboard') renderDashboardTable(main);
    else if (state.view === 'submissions') renderList(main, 'submissions');
    else if (state.view === 'completed') renderList(main, 'completed');
    else if (state.view === 'notifications') renderNotifications(main);
    else if (state.view === 'tracker') renderTracker(main);
    else if (state.view === 'termination' && state.current) { main.classList.add('narrow'); renderTermination(main); }
    else if (state.view === 'crf' && state.current) { main.classList.add('narrow'); renderCRF(main); }
    else if (state.view === 'implementation' && state.current) { main.classList.add('narrow'); renderImplementation(main); }
    else renderHome(main);
  }

  function navIcon(svg) { return `<span class="nav-icon">${svg}</span>`; }
  function closeMobileNav() {
    const nav = document.getElementById('site-nav'); const bd = document.getElementById('nav-backdrop');
    if (nav) nav.classList.remove('open'); if (bd) bd.classList.remove('open');
  }
  function footerHtml() {
    const year = new Date().getFullYear();
    return `<footer class="app-footer">
      <div>&copy; ${year} Workforce Junction &middot; HR Governance Solutions</div>
    </footer>`;
  }

  // ---------------- Home ----------------

  function renderHome(main) {
    const totalCount = state.index.length;
    const completedCount = state.index.filter(x => x.status === 'completed').length;
    const inProgressCount = state.index.filter(x => x.progress && x.progress.pct > 0 && x.progress.pct < 100).length;
    const recent = state.index.slice(0, 6);
    main.innerHTML = `
      <div class="home-hero">
        <img src="images/logo.png" alt="Workforce Junction" style="height:40px;margin-bottom:14px;">
        <div class="home-hero-title">Request &amp; Termination Workspace</div>
        <div class="home-hero-sub">Fill out Change Request Forms and Client Termination Checklists online instead of a Word document — track status, ownership, and progress in one place, then export a clean, branded copy when you're done.</div>
        <div class="home-hero-cta">
          <button class="btn btn-primary" id="cta-crf">+ New Change Request</button>
          <button class="btn btn-ghost" id="cta-term">+ New Termination Checklist</button>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat-card"><div class="stat-num">${totalCount}</div><div class="stat-label">Total submissions</div></div>
        <div class="stat-card"><div class="stat-num">${inProgressCount}</div><div class="stat-label">In progress</div></div>
        <div class="stat-card"><div class="stat-num">${completedCount}</div><div class="stat-label">Completed</div></div>
      </div>
      <div class="quick-grid">
        <div class="quick-card" id="qc-crf"><div class="quick-icon" style="background:var(--c-request)">&#9998;</div><div class="quick-title">Change Request Form</div><div class="quick-sub">Solution, approval &amp; final action tracking</div></div>
        <div class="quick-card" id="qc-term"><div class="quick-icon" style="background:var(--c-systems)">&#9989;</div><div class="quick-title">Client Termination Checklist</div><div class="quick-sub">Cross-team offboarding tasks &amp; sign-off</div></div>
        <div class="quick-card" id="qc-impl"><div class="quick-icon" style="background:#1B5E7A">&#127959;</div><div class="quick-title">Client Implementation Checklist</div><div class="quick-sub">Track go-live dates and headcount</div></div>
        <div class="quick-card" id="qc-submissions"><div class="quick-icon" style="background:var(--navy)">&#128203;</div><div class="quick-title">All Submissions</div><div class="quick-sub">Browse and continue existing work</div></div>
        <div class="quick-card" id="qc-completed"><div class="quick-icon" style="background:var(--st-completed)">&#9745;</div><div class="quick-title">Completed</div><div class="quick-sub">Finished checklists &amp; requests</div></div>
      </div>
      ${recent.length ? `<div style="font-weight:700;margin-bottom:10px;font-family:'Space Grotesk',sans-serif;">Recent</div><div class="card-grid" style="margin-bottom:24px;">${recent.map(cardHtml).join('')}</div>` : ''}
      <div class="about-strip">
        <p><b>Workforce Junction</b> is part of HR Governance Solutions — helping teams manage benefits administration, EDI, and client lifecycle work end to end.</p>
        <a class="website-link" href="${WEBSITE_URL}" target="_blank" rel="noopener">Visit hgsi.in &#8599;</a>
      </div>
    `;
    main.querySelector('#cta-crf').addEventListener('click', () => createNew('crf'));
    main.querySelector('#cta-term').addEventListener('click', () => createNew('termination'));
    main.querySelector('#qc-crf').addEventListener('click', () => createNew('crf'));
    main.querySelector('#qc-term').addEventListener('click', () => createNew('termination'));
    main.querySelector('#qc-impl').addEventListener('click', () => createNew('implementation'));
    main.querySelector('#qc-submissions').addEventListener('click', () => goView('submissions'));
    main.querySelector('#qc-completed').addEventListener('click', () => goView('completed'));
    main.querySelectorAll('[data-open]').forEach(c => c.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      openSubmission(c.dataset.open);
    }));
    main.querySelectorAll('[data-del]').forEach(c => c.addEventListener('click', (e) => removeSubmission(c.dataset.del, e)));
  }

  function stageLabelOf(s) { const f = (schema.STAGES || []).find(x => x[0] === s); return f ? f[1] : (s || 'Requested'); }

  function renderDataTableHtml(rows) {
    return `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Type</th><th>Client</th><th>Broker</th><th>Conversation #</th><th>Status</th><th>Progress</th><th>Updated</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr data-open="${r.id}">
                <td><span class="subcard-type ${typeBadgeClass(r.type)}" style="margin:0;">${typeLabelOf(r.type)}</span></td>
                <td>${esc(r.client || 'Untitled')}</td>
                <td>${esc(r.broker) || '—'}</td>
                <td>${esc(r.refConversation) || '—'}</td>
                <td><span class="stagepill-table stage-${r.status || 'requested'}">${stageLabelOf(r.status)}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                     <div class="progress-track" style="width:70px;height:6px;margin:0;"><div class="progress-fill" style="width:${r.progress ? r.progress.pct : 0}%"></div></div>
                     <span style="font-size:11.5px;color:var(--ink-faint);">${r.progress ? r.progress.pct : 0}%</span>
                  </div>
                </td>
                <td>${fmtDate(r.updatedAt)}</td>
                <td><button class="task-del" title="Delete submission" data-del="${r.id}">&#128465;</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDashboardTable(main) {
    let rows = state.index;
    const dashType = state.dashFilterType || 'all';
    const dashStatus = state.dashFilterStatus || null;
    const search = (state.dashSearchTerm || '').trim().toLowerCase();

    const dashClient = state.dashFilterClient || 'all';
    const dashBroker = state.dashFilterBroker || 'all';

    if (dashType !== 'all') rows = rows.filter(r => r.type === dashType);
    if (dashStatus) rows = rows.filter(r => r.status === dashStatus);
    if (dashClient !== 'all') rows = rows.filter(r => (r.client || 'Untitled') === dashClient);
    if (dashBroker !== 'all') rows = rows.filter(r => r.broker === dashBroker);
    if (search) {
      rows = rows.filter(r => {
        const client = (r.client || '').toLowerCase();
        const broker = (r.broker || '').toLowerCase();
        const refConv = (r.refConversation || '').toLowerCase();
        const taskText = (r.taskText || '').toLowerCase();
        return client.includes(search) || broker.includes(search) || refConv.includes(search) || taskText.includes(search);
      });
    }

    const allForCounts = state.index.filter(r => {
      if (dashType !== 'all' && r.type !== dashType) return false;
      if (search) {
        const client = (r.client || '').toLowerCase();
        const broker = (r.broker || '').toLowerCase();
        const refConv = (r.refConversation || '').toLowerCase();
        const taskText = (r.taskText || '').toLowerCase();
        return client.includes(search) || broker.includes(search) || refConv.includes(search) || taskText.includes(search);
      }
      return true;
    });

    const counts = {};
    (schema.STAGES || []).forEach(([key]) => { counts[key] = 0; });
    allForCounts.forEach(r => { counts[r.status || 'requested'] = (counts[r.status || 'requested'] || 0) + 1; });
    const maxCount = Math.max(1, ...Object.values(counts));

    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <div style="font-weight:700;font-size:20px;font-family:'Space Grotesk',sans-serif;">Dashboard — analyze status and trends</div>
          <div class="hint">${rows.length} of ${state.index.length} submission${state.index.length === 1 ? '' : 's'} shown</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="dash-export-btn">&#11015; Download Excel</button>
          ${dashType !== 'all' ? `<button class="btn btn-ghost btn-sm" id="dash-import-btn">&#11014; Upload Excel</button>
          <input type="file" id="dash-import-input" accept=".xlsx,.xls" style="display:none;">` : ''}
          <button class="btn btn-ghost btn-sm" id="dash-delete-all-btn" style="color:var(--c-analytics);">&#128465; Delete All (Filtered)</button>
        </div>
      </div>
      
      <div class="search-filter-row" style="display:flex;gap:12px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
        <div class="search-box-wrapper" style="flex:1;min-width:240px;position:relative;">
          <input type="text" id="dash-search-input" placeholder="Search by client, broker, conv# or task text…" value="${esc(state.dashSearchTerm || '')}" class="form-control" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">
        </div>
        <div class="filter-row" style="margin:0;">
          <div class="chip ${dashType === 'all' ? 'active' : ''}" data-dtype="all">All Types</div>
          <div class="chip ${dashType === 'crf' ? 'active' : ''}" data-dtype="crf">Change Requests</div>
          <div class="chip ${dashType === 'termination' ? 'active' : ''}" data-dtype="termination">Termination</div>
          <div class="chip ${dashType === 'implementation' ? 'active' : ''}" data-dtype="implementation">Implementation</div>
        </div>
        <select id="dash-filter-client" class="form-control" style="padding:6px 10px;border-radius:6px;">
          <option value="all">All Clients</option>
          ${[...new Set(state.index.map(r => r.client || 'Untitled'))].sort().map(c => `<option value="${esc(c)}" ${dashClient === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <select id="dash-filter-broker" class="form-control" style="padding:6px 10px;border-radius:6px;">
          <option value="all">All Brokers</option>
          ${[...new Set(state.index.map(r => r.broker).filter(Boolean))].sort().map(b => `<option value="${esc(b)}" ${dashBroker === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        </select>
        ${(dashType !== 'all' || dashStatus || search || dashClient !== 'all' || dashBroker !== 'all') ? `<button class="btn btn-ghost btn-sm" id="dash-clear-all-btn" style="color:var(--ink-soft);">Clear All Filters</button>` : ''}
      </div>

      ${dashType !== 'all' ? `<div class="hint" style="margin:-8px 0 12px;">Upload uses your ${dashType === 'crf' ? 'CRF Config Master Tracker' : dashType === 'implementation' ? 'Clients Implemented' : 'Clients Terminated'} spreadsheet format.</div>` : `<div class="hint" style="margin:-8px 0 12px;">Select a specific type above to enable Download/Upload Excel actions.</div>`}

      <div class="chart-card">
        <div class="chart-title">By Status ${dashStatus ? `<button class="chip" id="clear-status-filter" style="margin-left:8px;padding:3px 8px;font-size:11px;">Clear status filter &times;</button>` : '<span class="hint" style="font-weight:400;"> — click a bar to filter</span>'}</div>
        <div class="bar-chart">
          ${(schema.STAGES || []).map(([key, label]) => `
            <div class="bar-col" data-bar="${key}">
               <div class="bar-count">${counts[key] || 0}</div>
               <div class="bar-track"><div class="bar-fill stage-${key} ${dashStatus === key ? 'active' : ''}" style="height:${Math.round((counts[key] || 0) / maxCount * 100)}%"></div></div>
               <div class="bar-label">${label}</div>
            </div>`).join('')}
        </div>
      </div>

      ${rows.length === 0 ? `<div class="empty-state">No submissions found matching the criteria.</div>` : renderDataTableHtml(rows)}
    `;

    const searchInp = main.querySelector('#dash-search-input');
    searchInp.addEventListener('input', () => {
      state.dashSearchTerm = searchInp.value;
      renderDashboardTable(main);
    });

    main.querySelectorAll('[data-dtype]').forEach(chip => chip.addEventListener('click', () => {
      state.dashFilterType = chip.dataset.dtype;
      renderDashboardTable(main);
    }));

    main.querySelectorAll('[data-bar]').forEach(bar => bar.addEventListener('click', () => {
      state.dashFilterStatus = state.dashFilterStatus === bar.dataset.bar ? null : bar.dataset.bar;
      renderDashboardTable(main);
    }));

    const clearStatusBtn = main.querySelector('#clear-status-filter');
    if (clearStatusBtn) {
      clearStatusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.dashFilterStatus = null;
        renderDashboardTable(main);
      });
    }

    const clearAllBtn = main.querySelector('#dash-clear-all-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        state.dashSearchTerm = '';
        state.dashFilterType = 'all';
        state.dashFilterStatus = null;
        state.dashFilterClient = 'all';
        state.dashFilterBroker = 'all';
        renderDashboardTable(main);
      });
    }

    const clientSel = main.querySelector('#dash-filter-client');
    if (clientSel) clientSel.addEventListener('change', () => {
      state.dashFilterClient = clientSel.value;
      renderDashboardTable(main);
    });

    const brokerSel = main.querySelector('#dash-filter-broker');
    if (brokerSel) brokerSel.addEventListener('change', () => {
      state.dashFilterBroker = brokerSel.value;
      renderDashboardTable(main);
    });
    
    const delBtn = main.querySelector('#dash-delete-all-btn');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete ${rows.length} submission(s)? This cannot be undone.`)) return;
      try {
        const ids = rows.map(r => r.id);
        const res = await fetch('/api/submissions/bulk-delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        const text = await res.json();
        if (text.error) throw new Error(text.error);
        state.index = await loadIndex();
        renderDashboardTable(main);
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    });

    main.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      openSubmission(tr.dataset.open);
    }));
    main.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', (e) => removeSubmission(btn.dataset.del, e)));

    main.querySelector('#dash-export-btn').addEventListener('click', () => {
      const exportType = (dashType && dashType !== 'all') ? dashType : 'crf';
      window.open('/api/export-excel/' + exportType, '_blank');
    });

    const dashImportBtn = main.querySelector('#dash-import-btn');
    if (dashImportBtn) {
      const dashImportInput = main.querySelector('#dash-import-input');
      dashImportBtn.addEventListener('click', () => dashImportInput.click());
      dashImportInput.addEventListener('change', async () => {
        if (!dashImportInput.files.length) return;
        const fd = new FormData();
        fd.append('file', dashImportInput.files[0]);
        const originalText = dashImportBtn.textContent;
        dashImportBtn.textContent = 'Uploading…'; dashImportBtn.disabled = true;
        try {
          const res = await fetch('/api/import-excel/' + dashType, { method: 'POST', body: fd });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Upload failed');
          state.index = await loadIndex();
          renderDashboardTable(main);
          alert(`Successfully imported ${result.created} of ${result.totalRows} row(s) as historical records.`);
        } catch (e) {
          alert('Could not import file: ' + e.message);
          dashImportBtn.textContent = originalText; dashImportBtn.disabled = false;
        } finally {
          dashImportInput.value = '';
        }
      });
    }
  }

  function renderList(main, kind) {
    let rows = state.index;
    const showCompletedOnly = (kind === 'completed');
    
    const typeFilter = showCompletedOnly ? (state.completedTypeFilter || 'all') : (state.listTypeFilter || 'all');
    const statusFilter = showCompletedOnly ? 'completed' : null;
    const search = showCompletedOnly ? (state.completedSearchTerm || '').trim().toLowerCase() : (state.listSearchTerm || '').trim().toLowerCase();

    const listClient = showCompletedOnly ? (state.completedFilterClient || 'all') : (state.listFilterClient || 'all');
    const listBroker = showCompletedOnly ? (state.completedFilterBroker || 'all') : (state.listFilterBroker || 'all');
    
    if (typeFilter !== 'all') rows = rows.filter(r => r.type === typeFilter);
    if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
    if (listClient !== 'all') rows = rows.filter(r => (r.client || 'Untitled') === listClient);
    if (listBroker !== 'all') rows = rows.filter(r => r.broker === listBroker);
    if (search) {
      rows = rows.filter(r => {
        const client = (r.client || '').toLowerCase();
        const broker = (r.broker || '').toLowerCase();
        const refConv = (r.refConversation || '').toLowerCase();
        const taskText = (r.taskText || '').toLowerCase();
        return client.includes(search) || broker.includes(search) || refConv.includes(search) || taskText.includes(search);
      });
    }

    const title = showCompletedOnly ? 'Completed — browse finished submissions' : 'All Submissions — browse and search every record';

    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <div style="font-weight:700;font-size:20px;font-family:'Space Grotesk',sans-serif;">${title}</div>
          <div class="hint">${rows.length} of ${state.index.length} submission${state.index.length === 1 ? '' : 's'} shown</div>
        </div>
        ${typeFilter !== 'all' ? `
          <div style="display:flex;gap:8px;">
            <button class="btn btn-ghost btn-sm" id="list-export-btn">&#11015; Download Excel</button>
            <button class="btn btn-ghost btn-sm" id="list-import-btn">&#11014; Upload Excel</button>
            <input type="file" id="list-import-input" accept=".xlsx,.xls" style="display:none;">
          </div>
        ` : ''}
        <button class="btn btn-ghost btn-sm" id="list-delete-all-btn" style="color:var(--c-analytics);">&#128465; Delete All (Filtered)</button>
      </div>

      <div class="search-filter-row" style="display:flex;gap:12px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
        <div class="search-box-wrapper" style="flex:1;min-width:240px;position:relative;">
          <input type="text" id="list-search-input" placeholder="Search by client, broker, conv# or task text…" value="${esc(showCompletedOnly ? state.completedSearchTerm || '' : state.listSearchTerm || '')}" class="form-control" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">
        </div>
        <div class="filter-row" style="margin:0;">
          <div class="chip ${typeFilter === 'all' ? 'active' : ''}" data-type="all">All Types</div>
          <div class="chip ${typeFilter === 'crf' ? 'active' : ''}" data-type="crf">Change Requests</div>
          <div class="chip ${typeFilter === 'termination' ? 'active' : ''}" data-type="termination">Termination</div>
          <div class="chip ${typeFilter === 'implementation' ? 'active' : ''}" data-type="implementation">Implementation</div>
        </div>
        <select id="list-filter-client" class="form-control" style="padding:6px 10px;border-radius:6px;">
          <option value="all">All Clients</option>
          ${[...new Set(state.index.map(r => r.client || 'Untitled'))].sort().map(c => `<option value="${esc(c)}" ${listClient === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <select id="list-filter-broker" class="form-control" style="padding:6px 10px;border-radius:6px;">
          <option value="all">All Brokers</option>
          ${[...new Set(state.index.map(r => r.broker).filter(Boolean))].sort().map(b => `<option value="${esc(b)}" ${listBroker === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        </select>
        ${(typeFilter !== 'all' || search || listClient !== 'all' || listBroker !== 'all') ? `<button class="btn btn-ghost btn-sm" id="list-clear-all-btn" style="color:var(--ink-soft);">Clear All Filters</button>` : ''}
      </div>

      ${typeFilter !== 'all' ? `<div class="hint" style="margin:-8px 0 14px;">Upload/download use your ${typeFilter === 'crf' ? 'CRF Config Master Tracker' : typeFilter === 'implementation' ? 'Clients Implemented' : 'Clients Terminated'} spreadsheet format.</div>` : `<div class="hint" style="margin:-8px 0 14px;">Select a specific type above to enable Download/Upload Excel actions.</div>`}

      ${rows.length === 0 ? `<div class="empty-state">No submissions found matching the criteria.</div>` : renderDataTableHtml(rows)}
    `;

    const searchInp = main.querySelector('#list-search-input');
    searchInp.addEventListener('input', () => {
      if (showCompletedOnly) {
        state.completedSearchTerm = searchInp.value;
      } else {
        state.listSearchTerm = searchInp.value;
      }
      renderList(main, kind);
    });

    main.querySelectorAll('[data-type]').forEach(chip => {
      chip.addEventListener('click', () => {
        if (showCompletedOnly) {
          state.completedTypeFilter = chip.dataset.type;
        } else {
          state.listTypeFilter = chip.dataset.type;
        }
        renderList(main, kind);
      });
    });

    const clearAllBtn = main.querySelector('#list-clear-all-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (showCompletedOnly) {
          state.completedSearchTerm = '';
          state.completedTypeFilter = 'all';
          state.completedFilterClient = 'all';
          state.completedFilterBroker = 'all';
        } else {
          state.listSearchTerm = '';
          state.listTypeFilter = 'all';
          state.listFilterClient = 'all';
          state.listFilterBroker = 'all';
        }
        renderList(main, kind);
      });
    }

    const clientSel = main.querySelector('#list-filter-client');
    if (clientSel) clientSel.addEventListener('change', () => {
      if (showCompletedOnly) state.completedFilterClient = clientSel.value;
      else state.listFilterClient = clientSel.value;
      renderList(main, kind);
    });

    const brokerSel = main.querySelector('#list-filter-broker');
    if (brokerSel) brokerSel.addEventListener('change', () => {
      if (showCompletedOnly) state.completedFilterBroker = brokerSel.value;
      else state.listFilterBroker = brokerSel.value;
      renderList(main, kind);
    });
    
    const delBtnList = main.querySelector('#list-delete-all-btn');
    if (delBtnList) delBtnList.addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete ${rows.length} submission(s)? This cannot be undone.`)) return;
      try {
        const ids = rows.map(r => r.id);
        const res = await fetch('/api/submissions/bulk-delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        const text = await res.json();
        if (text.error) throw new Error(text.error);
        state.index = await loadIndex();
        renderList(main, kind);
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    });

    main.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      openSubmission(tr.dataset.open);
    }));
    main.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', (e) => removeSubmission(btn.dataset.del, e)));

    if (typeFilter !== 'all') {
      main.querySelector('#list-export-btn').addEventListener('click', () => {
        window.open('/api/export-excel/' + typeFilter, '_blank');
      });

      const importBtn = main.querySelector('#list-import-btn');
      const importInput = main.querySelector('#list-import-input');
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async () => {
        if (!importInput.files.length) return;
        const fd = new FormData();
        fd.append('file', importInput.files[0]);
        const originalText = importBtn.textContent;
        importBtn.textContent = 'Uploading…'; importBtn.disabled = true;
        try {
          const res = await fetch('/api/import-excel/' + typeFilter, { method: 'POST', body: fd });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Upload failed');
          state.index = await loadIndex();
          renderList(main, kind);
          alert(`Successfully imported ${result.created} of ${result.totalRows} row(s) as Completed records.`);
        } catch (e) {
          alert('Could not import file: ' + e.message);
          importBtn.textContent = originalText; importBtn.disabled = false;
        } finally {
          importInput.value = '';
        }
      });
    }
  }

  function typeBadgeClass(type) { return type === 'termination' ? 'type-termination' : type === 'implementation' ? 'type-implementation' : 'type-crf'; }
  function typeLabelOf(type) { return type === 'termination' ? 'Termination' : type === 'implementation' ? 'Implementation' : 'Change Request'; }

  function cardHtml(entry) {
    return `<div class="subcard" data-open="${entry.id}">
      <div class="subcard-body">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="subcard-type ${typeBadgeClass(entry.type)}">${typeLabelOf(entry.type)}</span>
          <span class="stagepill-table stage-${entry.status || 'requested'}">${stageLabelOf(entry.status)}</span>
        </div>
        <div class="subcard-client">${esc(entry.client || 'Untitled')}</div>
        <div class="subcard-meta">${entry.broker ? 'Broker: ' + esc(entry.broker) : 'No broker set'} &middot; Updated ${fmtDate(entry.updatedAt)}</div>
      </div>
      <button class="task-del" title="Delete submission" data-del="${entry.id}">&#128465;</button>
    </div>`;
  }

  // ---------------- Shared field helpers ----------------

  function fieldHtml(label, key, value, type, hint) {
    type = type || 'text';
    if (type === 'textarea') return `<div class="field"><label>${label}</label><textarea data-field="${key}">${esc(value)}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    return `<div class="field"><label>${label}</label><input type="${type}" data-field="${key}" value="${esc(value)}">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  }
  function pfield(label, path, value, type, hint) {
    type = type || 'text';
    if (type === 'textarea') return `<div class="field"><label>${label}</label><textarea data-crf-path="${path}">${esc(value)}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    return `<div class="field"><label>${label}</label><input type="${type}" data-crf-path="${path}" value="${esc(value)}">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  }
  function pselect(label, path, value, options) {
    return `<div class="field"><label>${label}</label><select data-crf-path="${path}">
      <option value="">—</option>
      ${options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select></div>`;
  }

  // ---------------- Render: Termination form ----------------

  function renderTermination(main) {
    const sub = state.current;
    const prog = sub.progress;
    const bySection = {};
    sub.tasks.forEach(t => { (bySection[t.section_key] = bySection[t.section_key] || []).push(t); });

    main.innerHTML = `
      <div class="back-link" id="back">&larr; Back</div>
      <div class="form-header">
        <div class="form-header-top">
          <div class="form-title">Client Termination Checklist</div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary btn-sm" id="save-btn">Save</button><button class="btn btn-ghost btn-sm" id="download-btn">Download .doc</button><button class="btn btn-danger-ghost btn-sm" id="delete-btn">Delete</button></div>
        </div>
        <div class="field-grid">
          ${fieldHtml('Client', 'client', sub.client)}
          ${fieldHtml('Broker Partner', 'broker', sub.broker)}
          ${fieldHtml('Requested Termination Date', 'header.requestedDate', sub.header.requestedDate, 'date')}
          ${fieldHtml('CRM', 'header.crm', sub.header.crm)}
          ${fieldHtml('EE Headcount', 'header.eeHeadcount', sub.header.eeHeadcount)}
          <div class="field"><label>Status</label>${headerStatusSelect(sub.status || 'requested')}</div>
          ${fieldHtml('Termination Reason', 'header.reason', sub.header.reason, 'textarea')}
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
        <div class="progress-label">${prog.done} of ${prog.total} tasks complete (${prog.pct}%)</div>
      </div>
      ${schema.TERMINATION_SECTIONS.map(sec => terminationSectionHtml(sec, bySection[sec.key] || [])).join('')}
      <datalist id="team-list">${schema.TEAM_NAMES.map(n => `<option value="${n}">`).join('')}</datalist>
    `;
    wireHeaderFields(main, sub);
    main.querySelector('#back').addEventListener('click', () => goView('submissions'));
    main.querySelector('#download-btn').addEventListener('click', () => window.open(`/api/submissions/${sub.id}/export`, '_blank'));
    const delBtn = main.querySelector('#delete-btn');
    if (delBtn) delBtn.addEventListener('click', (e) => removeSubmission(sub.id, e));
    wireSaveButton(main, sub);
    schema.TERMINATION_SECTIONS.forEach(sec => wireTerminationSection(main, sec));
  }

  function terminationSectionHtml(sec, tasks) {
    const doneCount = tasks.filter(t => t.status === 'completed').length;
    const active = tasks.filter(t => t.status !== 'completed');
    const completed = tasks.filter(t => t.status === 'completed');
    return `<div class="section-card" data-sec="${sec.key}" style="--sec-color:var(--c-${sec.key});--sec-tint:color-mix(in srgb, var(--c-${sec.key}) 10%, white);">
      <div class="section-head" data-toggle="${sec.key}">
        <div class="section-head-left"><div class="section-title">${sec.title}</div><div class="section-count">${doneCount}/${tasks.length}</div></div>
        <svg class="chevron open" data-chev="${sec.key}" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="section-body" data-body="${sec.key}">
        <div data-active-list="${sec.key}">${active.map(t => terminationTaskRow(sec, t)).join('')}</div>
        ${completed.length ? `<div class="completed-toggle" data-toggle-completed="${sec.key}">&#9662; ${completed.length} completed task${completed.length === 1 ? '' : 's'}</div>
        <div data-completed-list="${sec.key}" style="display:none;">${completed.map(t => terminationTaskRow(sec, t)).join('')}</div>` : ''}
        <div class="add-task-row">
          <input type="text" placeholder="Add a task to ${esc(sec.title)}…" data-addinput="${sec.key}">
          <button class="btn btn-ghost btn-sm" data-addbtn="${sec.key}">+ Add</button>
        </div>
      </div>
    </div>`;
  }

  function terminationTaskRow(sec, t) {
    const def = sec.items.find(i => i.id === t.item_key);
    const ex = t.extra_json || {};
    let extraField = '';
    if (def) {
      if (def.extra === 'date') extraField = `<input type="date" class="task-extra" data-extra="${t.id}:extraVal" value="${esc(ex.extraVal)}">`;
      else if (def.extra === 'text') extraField = `<input type="text" class="task-extra" placeholder="${def.extraLabel || 'Detail'}" data-extra="${t.id}:extraVal" value="${esc(ex.extraVal)}">`;
      else if (def.extra === 'yesno_amount') {
        extraField = `<select class="task-extra" data-extra="${t.id}:extraVal" style="width:70px;">
          <option value="" ${!ex.extraVal ? 'selected' : ''}>Fees?</option>
          <option value="yes" ${ex.extraVal === 'yes' ? 'selected' : ''}>Yes</option>
          <option value="no" ${ex.extraVal === 'no' ? 'selected' : ''}>No</option>
        </select>` + (ex.extraVal === 'yes' ? `<input type="text" class="task-extra" placeholder="$ amount" data-extra="${t.id}:extraVal2" value="${esc(ex.extraVal2)}">` : '');
      }
    }
    return `<div class="task-row ${t.status === 'completed' ? 'is-completed' : ''}" data-task="${t.id}">
      ${def && def.conditional ? `<div class="conditional-note">${def.conditional}</div>` : ''}
      <input type="checkbox" class="task-check" data-check="${t.id}" ${t.status === 'completed' ? 'checked' : ''}>
      <input type="text" class="task-label" data-label="${t.id}" value="${esc(t.label)}">
      ${extraField}
      <input type="text" class="task-notes" placeholder="Notes" data-notes="${t.id}" value="${esc(t.notes)}">
      ${t.status === 'completed' ? `<span class="task-completed-meta">&#10003; ${fmtDate(t.completed_on)}</span>` : ''}
      <button class="task-del" title="Delete task" data-del-task="${t.id}">&#128465;</button>
    </div>`;
  }

  function wireTerminationSection(main, sec) {
    const sub = state.current;
    const card = main.querySelector(`[data-sec="${sec.key}"]`);
    if (!card) return;

    function rerenderSection() {
      const tasks = sub.tasks.filter(t => t.section_key === sec.key);
      const fresh = document.createElement('div');
      fresh.innerHTML = terminationSectionHtml(sec, tasks);
      card.replaceWith(fresh.firstElementChild);
      wireTerminationSection(main, sec);
    }

    card.querySelector('[data-toggle]').addEventListener('click', () => {
      const body = card.querySelector('.section-body'); const chev = card.querySelector('.chevron');
      body.classList.toggle('collapsed'); chev.classList.toggle('open');
    });
    const compToggle = card.querySelector('[data-toggle-completed]');
    if (compToggle) compToggle.addEventListener('click', () => {
      const list = card.querySelector(`[data-completed-list="${sec.key}"]`);
      list.style.display = list.style.display === 'none' ? '' : 'none';
    });

    card.querySelectorAll('[data-check]').forEach(cb => {
      cb.addEventListener('change', () => {
        const task = sub.tasks.find(t => t.id === cb.dataset.check);
        if (task) {
          task.status = cb.checked ? 'completed' : 'requested';
          task.completed_on = cb.checked ? new Date().toISOString().slice(0, 10) : '';
          setSaveState('unsaved');
          rerenderSection();
          refreshHeaderProgress(main);
        }
      });
    });
    card.querySelectorAll('[data-label]').forEach(inp => {
      inp.addEventListener('input', () => {
        const task = sub.tasks.find(t => t.id === inp.dataset.label);
        if (task) {
          task.label = inp.value;
          setSaveState('unsaved');
        }
      });
    });
    card.querySelectorAll('[data-notes]').forEach(inp => {
      inp.addEventListener('input', () => {
        const task = sub.tasks.find(t => t.id === inp.dataset.notes);
        if (task) {
          task.notes = inp.value;
          setSaveState('unsaved');
        }
      });
    });
    card.querySelectorAll('[data-extra]').forEach(inp => {
      const evt = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evt, () => {
        const [taskId, field] = inp.dataset.extra.split(':');
        const task = sub.tasks.find(t => t.id === taskId);
        if (task) {
          task.extra_json = task.extra_json || {};
          task.extra_json[field] = inp.value;
          setSaveState('unsaved');
          if (field === 'extraVal') rerenderSection();
        }
      });
    });
    card.querySelectorAll('[data-del-task]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this task?')) return;
        sub.tasks = sub.tasks.filter(t => t.id !== btn.dataset.delTask);
        setSaveState('unsaved');
        rerenderSection();
        refreshHeaderProgress(main);
      });
    });
    const addBtn = card.querySelector('[data-addbtn]');
    const addInput = card.querySelector('[data-addinput]');
    if (addBtn) addBtn.addEventListener('click', () => {
      const val = addInput.value.trim(); if (!val) return;
      const newT = {
        id: 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        submission_id: sub.id,
        section_key: sec.key,
        item_key: 'custom_' + Date.now().toString(36),
        label: val,
        status: 'requested',
        assignee: '',
        completed_on: '',
        notes: '',
        extra_json: {}
      };
      sub.tasks.push(newT);
      setSaveState('unsaved');
      rerenderSection();
      refreshHeaderProgress(main);
    });
    if (addInput) addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });
  }

  function refreshHeaderProgress(main) {
    const sub = state.current;
    const prog = sub.progress;
    const fill = main.querySelector('.progress-fill'); const label = main.querySelector('.progress-label');
    if (fill) fill.style.width = prog.pct + '%';
    if (label) label.textContent = `${prog.done} of ${prog.total} ${sub.type === 'termination' ? 'tasks' : 'sections'} complete (${prog.pct}%)`;
    // also refresh section-level counts on the page
    if (sub.type === 'termination') {
      schema.TERMINATION_SECTIONS.forEach(sec => {
        const tasks = sub.tasks.filter(t => t.section_key === sec.key);
        const done = tasks.filter(t => t.status === 'completed').length;
        const el = main.querySelector(`[data-sec="${sec.key}"] .section-count`);
        if (el) el.textContent = `${done}/${tasks.length}`;
      });
    } else {
      const catEl = main.querySelector('[data-sec="categories"] .section-count');
      if (catEl) {
        const cats = sub.tasks.filter(t => t.section_key === 'categories');
        catEl.textContent = `${cats.filter(c => c.status === 'completed').length}/${cats.length}`;
      }
    }
  }

  function wireHeaderFields(main, sub) {
    main.querySelectorAll('[data-field]').forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const key = el.dataset.field;
        if (key.startsWith('header.')) {
          const hk = key.split('.')[1];
          sub.header[hk] = el.value;
        } else {
          sub[key] = el.value;
        }
        
        if (key === 'status') {
          const s = el.value;
          const today = new Date().toISOString().slice(0, 10);
          if (!sub.header) sub.header = {};
          if (!sub.body) sub.body = {};
          
          if (s === 'requested') {
            if (sub.type === 'crf') {
              if (!sub.body.request) sub.body.request = {};
              if (!sub.body.request.dateOfRequest) sub.body.request.dateOfRequest = today;
            }
          } else if (s === 'approved') {
            if (sub.type === 'crf') {
              if (!sub.body.approval) sub.body.approval = {};
              if (!sub.body.approval.approvedDate) sub.body.approval.approvedDate = today;
            }
          } else if (s === 'completed') {
            if (sub.type === 'crf' && !sub.header.completedOn) sub.header.completedOn = today;
            if (sub.type === 'implementation' && !sub.header.implementationCompletion) sub.header.implementationCompletion = today;
          }
          if (sub.type === 'crf') renderCRF(main);
          else if (sub.type === 'implementation') renderImplementation(main);
          else renderTermination(main);
        }
        
        setSaveState('unsaved');
      });
    });
  }
  function headerStatusSelect(value) {
    return `<select class="form-control" data-field="status" style="border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:13.5px;width:100%;">
      ${schema.STAGES.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;
  }

  // ---------------- Render: CRF form ----------------

  function renderCRF(main) {
    const sub = state.current;
    const prog = sub.progress;
    const catTasks = sub.tasks.filter(t => t.section_key === 'categories');
    const today = new Date().toISOString().slice(0, 10);
    if (!sub.header) sub.header = {};
    if (!sub.header.submittedOn) sub.header.submittedOn = today;
    const b = sub.body;
    b.request = b.request || {}; b.solution = b.solution || {}; b.note = b.note || {};
    if (!b.request.dateOfRequest) b.request.dateOfRequest = today;
    b.approval = b.approval || {}; b.finalSolution = b.finalSolution || {}; b.sow = b.sow || {}; b.action = b.action || {};

    main.innerHTML = `
      <div class="back-link" id="back">&larr; Back</div>
      <div class="notice">Save each completed request as <i>&lt;Client Name&gt; CRF &lt;change info&gt; &lt;date&gt;</i> and share only via the SharePoint link.</div>
      <div class="form-header">
        <div class="form-header-top">
          <div class="form-title">Change Request Form (CRF)</div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary btn-sm" id="save-btn">Save</button><button class="btn btn-ghost btn-sm" id="download-btn">Download .doc</button><button class="btn btn-danger-ghost btn-sm" id="delete-btn">Delete</button></div>
        </div>
        <div class="field-grid">
          ${fieldHtml('Reference Conversation No.', 'header.refConversation', sub.header.refConversation)}
          ${fieldHtml('Submitted By', 'header.submittedBy', sub.header.submittedBy)}
          ${fieldHtml('Submitted On', 'header.submittedOn', sub.header.submittedOn, 'date')}
          ${fieldHtml('Completed On', 'header.completedOn', sub.header.completedOn, 'date')}
          ${fieldHtml('Client', 'client', sub.client)}
          ${fieldHtml('Broker Partner', 'broker', sub.broker)}
          <div class="field"><label>Status</label>${headerStatusSelect(sub.status || 'requested')}</div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
        <div class="progress-label">${prog.done} of ${prog.total} sections complete (${prog.pct}%)</div>
      </div>

      ${crfSectionShell('request', 'Request', crfRequestBody(b))}
      ${crfSectionShell('solution', 'Suggested Change / Solution', crfSolutionBody(b))}
      ${crfSectionShell('note', 'Note', crfNoteBody(b))}
      ${crfSectionShell('approval', 'Approval of Solution & Fees', crfApprovalBody(b))}
      ${crfSectionShell('finalSolution', 'Final Solution', crfFinalBody(b))}
      ${crfSectionShell('sow', 'Action Required & Statement of Work', crfSowBody(b))}
      ${crfSectionShell('tracking', 'Tracking & Metrics', crfTrackingBody(b))}
      ${crfCategoriesShell(catTasks)}
      <datalist id="team-list">${schema.TEAM_NAMES.map(n => `<option value="${n}">`).join('')}</datalist>
    `;
    wireHeaderFields(main, sub);
    main.querySelector('#back').addEventListener('click', () => goView('submissions'));
    main.querySelector('#download-btn').addEventListener('click', () => window.open(`/api/submissions/${sub.id}/export`, '_blank'));
    const crfDelBtn = main.querySelector('#delete-btn');
    if (crfDelBtn) crfDelBtn.addEventListener('click', (e) => removeSubmission(sub.id, e));
    wireSaveButton(main, sub);
    wireCrfCommon(main);
  }

  // ---------------- Render: Client Implementation Checklist ----------------

  function renderImplementation(main) {
    const sub = state.current;
    const h = sub.header;
    main.innerHTML = `
      <div class="back-link" id="back">&larr; Back</div>
      <div class="form-header">
        <div class="form-header-top">
          <div class="form-title">Client Implementation Checklist</div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary btn-sm" id="save-btn">Save</button><button class="btn btn-ghost btn-sm" id="download-btn">Download .doc</button><button class="btn btn-danger-ghost btn-sm" id="delete-btn">Delete</button></div>
        </div>
        <div class="field-grid">
          ${fieldHtml('Client Name', 'client', sub.client)}
          ${fieldHtml('Broker', 'broker', sub.broker)}
          ${(schema.IMPLEMENTATION_FIELDS || []).map(f => fieldHtml(f.label, 'header.' + f.key, h[f.key], f.type)).join('')}
          <div class="field"><label>Status</label>${headerStatusSelect(sub.status || 'requested')}</div>
        </div>
      </div>
      <div class="hint" style="padding:4px 4px 20px;">This checklist tracks a single client implementation record — fill in the dates and headcount as they become available, then update the status as it progresses.</div>
    `;
    wireHeaderFields(main, sub);
    main.querySelector('#back').addEventListener('click', () => goView('submissions'));
    main.querySelector('#download-btn').addEventListener('click', () => window.open(`/api/submissions/${sub.id}/export`, '_blank'));
    const implDelBtn = main.querySelector('#delete-btn');
    if (implDelBtn) implDelBtn.addEventListener('click', (e) => removeSubmission(sub.id, e));
    wireSaveButton(main, sub);
  }

  function crfSectionShell(key, title, bodyHtml) {
    return `<div class="section-card" data-sec="${key}" style="--sec-color:var(--c-${key});--sec-tint:color-mix(in srgb, var(--c-${key}) 10%, white);">
      <div class="section-head" data-toggle="${key}">
        <div class="section-head-left"><div class="section-title">${title}</div></div>
        <svg class="chevron open" data-chev="${key}" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="section-body" data-body="${key}">
        ${bodyHtml}
      </div>
    </div>`;
  }

  function radio(path, val, current, label) {
    return `<label class="radio-item"><input type="radio" name="${path}" data-crf-path="${path}" value="${val}" ${current === val ? 'checked' : ''}> ${label}</label>`;
  }
  function cb(path, checked, label) {
    return `<label class="cb-item"><input type="checkbox" data-crf-check="${path}" ${checked ? 'checked' : ''}> ${label}</label>`;
  }

  function crfRequestBody(b) {
    const r = b.request;
    return `<div class="field-grid">
        ${pfield('Requested by', 'request.requestedBy', r.requestedBy)}
        ${pfield('Date of request', 'request.dateOfRequest', r.dateOfRequest, 'date')}
      </div>
      <div style="margin-top:10px" class="radio-group">
        <span class="hint" style="align-self:center">Was the initial request modified?</span>
        ${radio('request.modified', 'yes', r.modified, 'Yes')}${radio('request.modified', 'no', r.modified, 'No')}
      </div>
      <div class="field" style="margin-top:10px"><label>What is the request and why?</label><textarea data-crf-path="request.requestText">${esc(r.requestText)}</textarea></div>
      <div class="field-grid" style="margin-top:10px">${pfield('Desired completion date', 'request.desiredCompletion', r.desiredCompletion, 'date')}</div>`;
  }
  function crfSolutionBody(b) {
    const s = b.solution;
    return `<div class="field-grid">
        ${pfield('Solution Architect', 'solution.architect', s.architect)}
        ${pfield('Reviewed on', 'solution.reviewedOn', s.reviewedOn, 'date')}
      </div>
      <div class="field" style="margin-top:8px"><label>Proposed solution</label><textarea data-crf-path="solution.proposedSolution">${esc(s.proposedSolution)}</textarea></div>
      <div class="field-grid" style="margin-top:10px">
        <div class="field"><label>Fee</label><div style="display:flex;gap:8px;">
          <input type="text" placeholder="$ amount" data-crf-path="solution.fee" value="${esc(s.fee)}" ${s.feeNone ? 'disabled' : ''}>
          <label class="cb-item"><input type="checkbox" data-crf-check="solution.feeNone" ${s.feeNone ? 'checked' : ''}> None</label>
        </div></div>
        ${pfield('Proposed completion date', 'solution.proposedCompletion', s.proposedCompletion, 'date')}
      </div>`;
  }
  function crfNoteBody(b) {
    const n = b.note;
    return `<div class="radio-group" style="flex-direction:column;align-items:flex-start;">
      ${radio('note.kind', 'change', n.kind, 'Change — from what was requested earlier by Customer')}
      ${radio('note.kind', 'correction', n.kind, 'Correction — of how request was implemented')}
    </div>`;
  }
  function crfApprovalBody(b) {
    const a = b.approval;
    return `<div class="field-grid">
        ${pfield('Approved by', 'approval.approvedBy', a.approvedBy)}
        ${pfield('Date', 'approval.approvedDate', a.approvedDate, 'date')}
        ${pfield('Ticket #', 'approval.ticketNo', a.ticketNo)}
      </div>
      <div class="radio-group" style="margin-top:10px">
        <span class="hint" style="align-self:center">Fees charged?</span>
        ${radio('approval.feesCharged', 'yes', a.feesCharged, 'Yes')}${radio('approval.feesCharged', 'no', a.feesCharged, 'No')}
      </div>
      ${a.feesCharged === 'yes' ? `<div class="field-grid" style="margin-top:10px">${pfield('HelloSign ticket #', 'approval.helloSignTicket', a.helloSignTicket)}</div>` : ''}`;
  }
  function crfFinalBody(b) {
    const f = b.finalSolution;
    return `<div class="checkbox-group"><label class="cb-item"><input type="checkbox" data-crf-check="finalSolution.approved" ${f.approved ? 'checked' : ''}> Approved</label></div>
      <div class="field-grid" style="margin-top:8px">${pfield('Date promised', 'finalSolution.datePromised', f.datePromised, 'date')}</div>`;
  }
  function crfTrackingBody(b) {
    const tr = b.tracking || {};
    const gridFields = (schema.TRACKING_FIELDS || []).filter(f => f.type !== 'textarea');
    const textFields = (schema.TRACKING_FIELDS || []).filter(f => f.type === 'textarea');
    return `<div class="field-grid">
      ${gridFields.map(f => f.type === 'select' ? pselect(f.label, 'tracking.' + f.key, tr[f.key] || '', f.options) : pfield(f.label, 'tracking.' + f.key, tr[f.key] || '')).join('')}
    </div>
    ${textFields.map(f => `<div style="margin-top:10px">${pfield(f.label, 'tracking.' + f.key, tr[f.key] || '', 'textarea')}</div>`).join('')}
    <div class="hint" style="margin-top:8px;">These fields match your CRF Config Master Tracker spreadsheet columns, so the Excel export lines up directly.</div>`;
  }

  function crfSowBody(b) {
    const a = b.action, s = b.sow;
    return `<div class="checkbox-group">
        ${cb('action.configChange', a.configChange, 'Configuration Change')}${cb('action.maintenanceFix', a.maintenanceFix, 'Maintenance Fix')}
        ${cb('action.dataFix', a.dataFix, 'Data Fix')}${cb('action.sprintRelease', a.sprintRelease, 'Sprint Release')}
        ${cb('action.edi', a.edi, 'EDI')}${cb('action.processChange', a.processChange, 'Process Change')}
      </div>
      <div class="field" style="margin-top:10px"><label>Describe Statement of Work</label><textarea data-crf-path="sow.text" style="min-height:100px">${esc(s.text)}</textarea></div>
      <div class="field" style="margin-top:8px"><label>Screenshots / images (reference or link)</label>
        <input type="text" placeholder="Paste link or filename" data-crf-path="sow.screenshotNote" value="${esc(s.screenshotNote)}">
      </div>`;
  }

  function crfCategoriesShell(catTasks) {
    const groups = {};
    catTasks.forEach(c => { const g = c.label.includes(' — ') ? c.label.split(' — ')[0] : 'Other'; (groups[g] = groups[g] || []).push(c); });
    const rows = Object.keys(groups).map(g => `
      <div class="cat-group-title">${g}</div>
      ${groups[g].map(c => `<div class="cat-row" data-cat-row="${c.id}">
        <label class="cb-item"><input type="checkbox" data-cat-check="${c.id}" ${c.status === 'completed' ? 'checked' : ''}> <input type="text" class="task-label" style="width:auto;" data-cat-label="${c.id}" value="${esc(c.label)}"></label>
        ${Object.keys(c.extra_json || {}).length ? `<div class="cat-sub-fields">${Object.keys(c.extra_json).map(s => `<input type="text" placeholder="${s[0].toUpperCase() + s.slice(1)}" data-cat-sub="${c.id}:${s}" value="${esc(c.extra_json[s])}">`).join('')}</div>` : ''}
        <button class="task-del" data-del-cat="${c.id}">&#128465;</button>
      </div>`).join('')}
    `).join('');
    return `<div class="section-card" data-sec="categories" style="--sec-color:var(--c-categories);--sec-tint:color-mix(in srgb, var(--c-categories) 10%, white);">
      <div class="section-head" data-toggle="categories">
        <div class="section-head-left"><div class="section-title">Change Category</div><div class="section-count">${catTasks.filter(c => c.status === 'completed').length}/${catTasks.length}</div></div>
        <svg class="chevron open" data-chev="categories" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="section-body" data-body="categories">
        ${rows}
        <div class="add-task-row">
          <input type="text" placeholder="Add a custom category…" id="cat-add-input">
          <button class="btn btn-ghost btn-sm" id="cat-add-btn">+ Add</button>
        </div>
      </div>
    </div>`;
  }

  function wireCrfCommon(main) {
    const sub = state.current;

    main.querySelectorAll('[data-toggle]').forEach(head => {
      head.addEventListener('click', () => {
        const key = head.dataset.toggle;
        const body = main.querySelector(`[data-body="${key}"]`);
        const chev = main.querySelector(`[data-chev="${key}"]`);
        body.classList.toggle('collapsed'); chev.classList.toggle('open');
      });
    });

    main.querySelectorAll('[data-crf-path]').forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : (el.type === 'radio' ? 'change' : 'input');
      el.addEventListener(evt, () => {
        const parts = el.dataset.crfPath.split('.');
        const topKey = parts[0];
        sub.body[topKey] = sub.body[topKey] || {};
        sub.body[topKey][parts[1]] = el.value;
        setSaveState('unsaved');
        if (el.name === 'approval.feesCharged') {
          renderCRF(main);
        }
      });
    });
    main.querySelectorAll('[data-crf-check]').forEach(el => {
      el.addEventListener('change', () => {
        const parts = el.dataset.crfCheck.split('.');
        const topKey = parts[0];
        sub.body[topKey] = sub.body[topKey] || {};
        sub.body[topKey][parts[1]] = el.checked;
        setSaveState('unsaved');
        if (el.dataset.crfCheck === 'solution.feeNone') renderCRF(main);
      });
    });
    main.querySelectorAll('[data-cat-check]').forEach(el => {
      el.addEventListener('change', () => {
        const task = sub.tasks.find(t => t.id === el.dataset.catCheck);
        if (task) {
          task.status = el.checked ? 'completed' : 'requested';
          setSaveState('unsaved');
          refreshHeaderProgress(main);
        }
      });
    });
    main.querySelectorAll('[data-cat-label]').forEach(el => {
      el.addEventListener('input', () => {
        const task = sub.tasks.find(t => t.id === el.dataset.catLabel);
        if (task) {
          task.label = el.value;
          setSaveState('unsaved');
        }
      });
    });
    main.querySelectorAll('[data-cat-sub]').forEach(el => {
      el.addEventListener('input', () => {
        const [cid, field] = el.dataset.catSub.split(':');
        const task = sub.tasks.find(t => t.id === cid);
        if (task) {
          task.extra_json = task.extra_json || {};
          task.extra_json[field] = el.value;
          setSaveState('unsaved');
        }
      });
    });
    main.querySelectorAll('[data-del-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this category item?')) return;
        sub.tasks = sub.tasks.filter(t => t.id !== btn.dataset.delCat);
        setSaveState('unsaved');
        renderCRF(main);
      });
    });
    const catAddBtn = main.querySelector('#cat-add-btn');
    const catAddInput = main.querySelector('#cat-add-input');
    if (catAddBtn) catAddBtn.addEventListener('click', () => {
      const val = catAddInput.value.trim(); if (!val) return;
      const newT = {
        id: 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        submission_id: sub.id,
        section_key: 'categories',
        item_key: 'custom_' + Date.now().toString(36),
        label: val,
        status: 'requested',
        assignee: '',
        completed_on: '',
        notes: '',
        extra_json: {}
      };
      sub.tasks.push(newT);
      setSaveState('unsaved');
      renderCRF(main);
    });
    if (catAddInput) catAddInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); catAddBtn.click(); } });
  }


  // ---------------- Notifications ----------------

  async function renderNotifications(main) {
    main.innerHTML = `<div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>`;
    let logs = [];
    try {
      logs = await api('/api/notifications');
    } catch (e) {
      main.innerHTML = `<div class="empty-state">Failed to load notifications: ${esc(e.message)}</div>`;
      return;
    }

    function fmtRelTime(iso) {
      if (!iso) return '—';
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      return Math.floor(hrs / 24) + 'd ago';
    }

    function subjectIcon(subject) {
      if (!subject) return '📧';
      if (subject.toLowerCase().includes('approved')) return '✅';
      if (subject.toLowerCase().includes('testing')) return '🔍';
      if (subject.toLowerCase().includes('completed')) return '🎉';
      if (subject.toLowerCase().includes('assigned')) return '👤';
      return '📧';
    }

    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        <div>
          <div style="font-weight:700;font-size:20px;font-family:'Space Grotesk',sans-serif;">Notifications — Email Activity Log</div>
          <div class="hint">${logs.length} notification${logs.length === 1 ? '' : 's'} recorded</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="notif-search" placeholder="Search notifications…" class="form-control" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;width:240px;">
        </div>
      </div>

      ${logs.length === 0 ? `
        <div class="empty-state" style="padding:60px 24px;">
          <div style="font-size:40px;margin-bottom:12px;">🔔</div>
          <div style="font-weight:600;font-size:16px;margin-bottom:6px;">No notifications yet</div>
          <div class="hint">Notifications appear here when status changes or tasks are assigned.</div>
        </div>
      ` : `
        <div id="notif-feed" style="display:flex;flex-direction:column;gap:10px;">
          ${logs.map(log => `
            <div class="notif-card" data-notif-body="${esc(log.body || '')}" style="
              background:var(--surface);border:1px solid var(--border);border-radius:12px;
              padding:14px 18px;box-shadow:var(--shadow);cursor:pointer;
              border-left:4px solid var(--accent);transition:box-shadow 0.15s,transform 0.12s;
            ">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
                  <div style="font-size:22px;flex-shrink:0;line-height:1;">${subjectIcon(log.subject)}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:13.5px;color:var(--ink);margin-bottom:3px;">${esc(log.subject || '(no subject)')}</div>
                    <div style="font-size:12px;color:var(--ink-soft);">To: ${esc(log.to_email || '—')}</div>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--ink-faint);white-space:nowrap;flex-shrink:0;">
                  ${fmtRelTime(log.sent_at)}<br>
                  <span style="font-size:10px;">${fmtDate(log.sent_at)}</span>
                </div>
              </div>
              <div class="notif-body-preview" style="
                display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);
                font-size:12.5px;color:var(--ink-soft);white-space:pre-wrap;line-height:1.55;
                background:var(--surface-alt);border-radius:6px;padding:10px 12px;
              ">${esc(log.body || '')}</div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    // Toggle body on click
    main.querySelectorAll('.notif-card').forEach(card => {
      card.addEventListener('click', () => {
        const preview = card.querySelector('.notif-body-preview');
        if (preview) {
          const isOpen = preview.style.display !== 'none';
          preview.style.display = isOpen ? 'none' : 'block';
          card.style.boxShadow = isOpen ? '' : '0 4px 18px rgba(108,92,231,0.15)';
          card.style.transform = isOpen ? '' : 'translateY(-1px)';
        }
      });
    });

    // Search filter
    const searchInput = main.querySelector('#notif-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        main.querySelectorAll('.notif-card').forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(q) ? '' : 'none';
        });
      });
    }
  }

  // ---------------- Tracker (read-only) ----------------

  async function renderTracker(main) {
    main.innerHTML = `<div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>`;
    let data = { crf: [], implementation: [], termination: [] };
    try {
      data = await api('/api/tracker/data');
    } catch (e) {
      main.innerHTML = `<div class="empty-state">Failed to load tracker data: ${esc(e.message)}</div>`;
      return;
    }

    const activeTab = state.trackerTab || 'crf';

    function trackerTabBtn(key, label, count) {
      return `<button class="tracker-tab-btn ${activeTab === key ? 'active' : ''}" data-ttab="${key}" style="
        padding:9px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;
        border:1px solid var(--border);background:${activeTab === key ? 'var(--accent)' : 'var(--surface)'};
        color:${activeTab === key ? '#fff' : 'var(--ink-soft)'};transition:all 0.15s;
      ">${label} <span style="font-size:11px;opacity:0.75;">(${count})</span></button>`;
    }

    function statusPill(status, is_deleted) {
      if (is_deleted) return `<span style="background:#FFDAD6;color:#C00000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;">DELETED</span>`;
      const cls = status || 'requested';
      return `<span class="stagepill-table stage-${cls}">${stageLabelOf(cls)}</span>`;
    }

    function fmtD(d) { return d ? fmtDate(d) : '—'; }

    let tableHtml = '';
    if (activeTab === 'crf') {
      const rows = data.crf;
      tableHtml = rows.length === 0 ? `<div class="empty-state">No CRF records found.</div>` : `
        <div style="overflow-x:auto;">
          <table class="data-table tracker-ro-table">
            <thead><tr>
              <th>Month</th><th>Client</th><th>Broker</th>
              <th>Category</th><th>Config Analyst</th><th>Testing Analyst</th>
              <th>Impl. Manager</th><th>Completed</th><th>Billable</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr style="${r.is_deleted ? 'opacity:0.6;text-decoration:line-through;background:#FFF9E6;' : ''}">
                <td>${esc(r.month)}</td>
                <td style="font-weight:600;">${esc(r.client || 'Untitled')}</td>
                <td>${esc(r.broker || '—')}</td>
                <td>${esc(r.category || '—')}</td>
                <td>${esc(r.configAnalyst || '—')}</td>
                <td>${esc(r.testingAnalyst || '—')}</td>
                <td>${esc(r.implementationManager || '—')}</td>
                <td>${fmtD(r.completedDate)}</td>
                <td>${esc(r.billable || '—')}</td>
                <td>${statusPill(r.status, r.is_deleted)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'implementation') {
      const rows = data.implementation;
      tableHtml = rows.length === 0 ? `<div class="empty-state">No Implementation records found.</div>` : `
        <div style="overflow-x:auto;">
          <table class="data-table tracker-ro-table">
            <thead><tr>
              <th>#</th><th>Client</th><th>Broker</th>
              <th>Design Guide Received</th><th>Impl. Completion</th>
              <th>Client Go-Live</th><th>Headcount</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${rows.map((r, i) => `<tr style="${r.is_deleted ? 'opacity:0.6;text-decoration:line-through;background:#FFF9E6;' : ''}">
                <td style="color:var(--ink-faint);">${i + 1}</td>
                <td style="font-weight:600;">${esc(r.client || 'Untitled')}</td>
                <td>${esc(r.broker || '—')}</td>
                <td>${fmtD(r.designGuideReceived)}</td>
                <td>${fmtD(r.implementationCompletion)}</td>
                <td>${fmtD(r.clientGoLive)}</td>
                <td>${esc(r.headcount || '—')}</td>
                <td>${statusPill(r.status, r.is_deleted)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      const rows = data.termination;
      tableHtml = rows.length === 0 ? `<div class="empty-state">No Termination records found.</div>` : `
        <div style="overflow-x:auto;">
          <table class="data-table tracker-ro-table">
            <thead><tr>
              <th>#</th><th>Client</th><th>Broker</th>
              <th>Termination Date</th><th>EE Headcount</th><th>Reason</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${rows.map((r, i) => `<tr style="${r.is_deleted ? 'opacity:0.6;text-decoration:line-through;background:#FFF9E6;' : ''}">
                <td style="color:var(--ink-faint);">${i + 1}</td>
                <td style="font-weight:600;">${esc(r.client || 'Untitled')}</td>
                <td>${esc(r.broker || '—')}</td>
                <td>${fmtD(r.terminationDate)}</td>
                <td>${esc(r.headcount || '—')}</td>
                <td style="max-width:220px;white-space:normal;">${esc(r.reason || '—')}</td>
                <td>${statusPill(r.status, r.is_deleted)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        <div>
          <div style="font-weight:700;font-size:20px;font-family:'Space Grotesk',sans-serif;">Tracker — View-Only Records</div>
          <div class="hint">All records including deleted (shown with strikethrough). No editing from this view.</div>
        </div>
        <div style="display:flex;gap:8px;">
          <a href="/api/export-excel/crf" target="_blank" class="btn btn-ghost btn-sm">⬇ Download CRF Excel</a>
          <a href="/api/export-excel/implementation" target="_blank" class="btn btn-ghost btn-sm">⬇ Download Impl. Excel</a>
          <a href="/api/export-excel/termination" target="_blank" class="btn btn-ghost btn-sm">⬇ Download Term. Excel</a>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        ${trackerTabBtn('crf', '📋 Change Requests', data.crf.length)}
        ${trackerTabBtn('implementation', '🏗 Implementation', data.implementation.length)}
        ${trackerTabBtn('termination', '📤 Termination', data.termination.length)}
      </div>

      <div style="background:var(--accent-soft);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:16px;">👁</span>
        <span style="font-size:12.5px;color:var(--ink-soft);">This is a <strong>view-only</strong> snapshot. Deleted records are highlighted in yellow with strikethrough. Use the Download buttons to export the full Excel tracker file.</span>
      </div>

      <div id="tracker-table-area">
        ${tableHtml}
      </div>
    `;

    main.querySelectorAll('[data-ttab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.trackerTab = btn.dataset.ttab;
        renderTracker(main);
      });
    });
  }

  // ---------------- Admin ----------------
  let isAdminAuthenticated = false;

  async function renderAdmin(main) {
    if (!isAdminAuthenticated) {
      main.innerHTML = `
        <div style="max-width:400px;margin:80px auto;padding:30px;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <h2 style="margin-top:0;font-family:'Space Grotesk',sans-serif;">Admin Login</h2>
          <div class="field"><label>Username</label><input type="text" id="admin-user" class="form-control"></div>
          <div class="field" style="margin-top:16px;"><label>Password</label><input type="password" id="admin-pass" class="form-control"></div>
          <button class="btn btn-primary" style="width:100%;margin-top:24px;" id="admin-login-btn">Login</button>
        </div>
      `;
      main.querySelector('#admin-login-btn').addEventListener('click', () => {
        const u = main.querySelector('#admin-user').value;
        const p = main.querySelector('#admin-pass').value;
        if (u === 'Kiran' && p === 'WFJ@1234') {
          isAdminAuthenticated = true;
          renderAdmin(main);
        } else {
          alert('Invalid credentials');
        }
      });
      return;
    }

    main.innerHTML = `<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>`;
    let teams = [];
    try {
      teams = await api('/api/admin/teams');
    } catch (e) {
      main.innerHTML = `<div class="empty-state">Failed to load teams: ${e.message}</div>`;
      return;
    }
    
    main.innerHTML = `
      <div style="font-weight:700;font-size:20px;font-family:'Space Grotesk',sans-serif;margin-bottom:20px;">Admin & Teams</div>
      <div class="hint" style="margin-bottom:20px;">Manage team members. These members will appear in the assignment dropdowns across the application. Note that schema definitions may require a refresh to propagate everywhere.</div>
      
      <div class="card-grid" style="display:block;">
        ${teams.map(t => `
          <div class="section-card" style="margin-bottom:16px;">
            <div class="section-head"><div class="section-title">${esc(t.name)}</div></div>
            <div class="section-body" style="padding:0;">
              <table class="data-table">
                <thead><tr><th>Name</th><th>Email</th><th width="80"></th></tr></thead>
                <tbody>
                  ${t.members.map(m => `
                    <tr>
                      <td>${esc(m.name)}</td>
                      <td>${esc(m.email)}</td>
                      <td><button class="btn btn-ghost btn-sm" onclick="window.deleteMember('${m.id}')">Delete</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div style="padding:12px;background:#f9fafb;border-top:1px solid var(--border);display:flex;gap:8px;">
                <input type="text" id="add-name-${t.id}" placeholder="Name" class="form-control" style="flex:1;padding:6px 10px;">
                <input type="email" id="add-email-${t.id}" placeholder="Email" class="form-control" style="flex:2;padding:6px 10px;">
                <button class="btn btn-primary btn-sm" onclick="window.addMember('${t.id}')">Add Member</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    window.deleteMember = async (id) => {
      if (!confirm('Remove this member?')) return;
      await api('/api/admin/members/' + id, { method: 'DELETE' });
      schema = await loadSchema();
      renderAdmin(main);
    };
    
    window.addMember = async (teamId) => {
      const name = document.getElementById('add-name-' + teamId).value;
      const email = document.getElementById('add-email-' + teamId).value;
      if (!name || !email) return alert('Name and email required');
      await api('/api/admin/teams/' + teamId + '/members', { method: 'POST', body: JSON.stringify({ name, email }) });
      schema = await loadSchema();
      renderAdmin(main);
    };
  }

  // ---------------- Boot ----------------

  async function init() {
    try {
      [schema, state.index] = await Promise.all([loadSchema(), loadIndex()]);
    } catch (err) {
      console.warn('Backend server not reachable, using offline preview mode:', err);
      state.isOffline = true;
      if (typeof TERMINATION_SECTIONS !== 'undefined') {
        schema = {
          TERMINATION_SECTIONS,
          CRF_SECTIONS,
          CATEGORY_MATRIX,
          CATEGORY_OPTIONS,
          TRACKING_FIELDS,
          TEAM_NAMES: typeof TEAM_NAMES !== 'undefined' ? TEAM_NAMES : [],
          IMPLEMENTATION_FIELDS,
          TERMINATION_EXTRA_FIELDS,
          TEAMS: [],
          STAGES: [
            { key: 'requested', label: 'Requested' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'review', label: 'In Review' },
            { key: 'completed', label: 'Completed' }
          ]
        };
      }
      try {
        state.index = JSON.parse(localStorage.getItem('wfj_offline_index') || '[]');
      } catch (e) {
        state.index = [];
      }
    }
    render();
  }
  init();
})();

  