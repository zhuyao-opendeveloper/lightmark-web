/* 轻刻网页版 LightMark Web — 纯前端、无后端、无构建
 * 功能对标 Android 版：待办 CRUD / 子任务 / 私密+密码锁 / 智能清单 / 拖拽排序 / 批量
 *         / 习惯打卡 / 目标 / 任务模板 / 重复自动生成 / 回收站 / 看板·四象限·表格视图
 *         / 番茄钟 / 回顾复盘 / 多格式导出 / GitHub 同步 / AI 助手 / 主题
 * 数据契约兼容 Android 的 lightmark-data.json（todos / categories），并扩展 habits / goals / templates。
 */
(function () {
  'use strict';

  /* ============ 1. 常量与工具 ============ */
  const SYNC_VERSION = 1;
  const DATA_FILE = 'lightmark-data.json';
  const PRIORITIES = ['IDLE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED'];
  const PRIO_LABEL = { IDLE: '空闲', LOW: '低', MEDIUM: '中', HIGH: '高', URGENT: '紧急' };
  const STATUS_LABEL = { ACTIVE: '进行中', PAUSED: '暂停', CANCELLED: '已取消' };

  const now = () => Date.now();
  const genId = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const dayStr = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const todayStr = () => dayStr(now());

  function colorToHex(n) { if (typeof n !== 'number' || isNaN(n)) n = 0xff6200ee; return '#' + (n & 0xffffff).toString(16).padStart(6, '0'); }
  function hexToColor(hex) { const h = (hex || '#6200ee').replace('#', ''); return parseInt('ff' + h, 16); }
  function esc(s) { return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
  function tsToDateInput(ts) { if (!ts) return ''; const d = new Date(ts); return new Date(ts - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日`; }
  function dueLabel(ts) {
    if (!ts) return '';
    const diff = Math.floor((ts - now()) / 86400000);
    if (diff < 0) return `已逾期${-diff}天`;
    if (diff === 0) return '今天到期';
    if (diff === 1) return '明天到期';
    return `剩余${diff}天`;
  }
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(b64))); }
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ============ 2. 数据契约 ============ */
  function emptyTodo(o = {}) {
    return Object.assign({
      id: genId('todo'), title: '', description: '', isCompleted: false,
      priority: 'MEDIUM', categoryId: null, tags: [], dueDate: null, startDate: null,
      isPinned: false, isBlocked: false, isPrivate: false, status: 'ACTIVE',
      isArchived: false, isDeleted: false, deletedAt: null, recurrenceRule: null,
      parentId: null, subtasks: [], order: now(), createdAt: now(), updatedAt: now(), completedAt: null,
    }, o);
  }
  function emptyCategory(o = {}) { return Object.assign({ id: genId('cat'), name: '', color: 0xff6200ee, icon: 'folder', createdAt: now() }, o); }
  function emptyHabit(o = {}) { return Object.assign({ id: genId('h'), name: '', icon: '✅', period: 1, target: 1, history: {} }, o); }
  function emptyGoal(o = {}) { return Object.assign({ id: genId('g'), title: '', target: 100, unit: '', current: 0, miles: [] }, o); }
  function emptyTpl(o = {}) { return Object.assign({ id: genId('t'), name: '', icon: '📋', title: '', priority: 'MEDIUM', subs: [] }, o); }

  function normalizeTodo(r) {
    if (!r || typeof r !== 'object') return null;
    const t = emptyTodo(); const out = Object.assign(t, r);
    out.id = String(r.id != null ? r.id : t.id);
    out.title = String(r.title != null ? r.title : '');
    out.priority = PRIORITIES.includes(r.priority) ? r.priority : 'MEDIUM';
    out.status = STATUSES.includes(r.status) ? r.status : 'ACTIVE';
    out.tags = Array.isArray(r.tags) ? r.tags.map(String) : [];
    out.subtasks = Array.isArray(r.subtasks) ? r.subtasks.map((s) => ({ id: s.id || genId('sub'), title: String(s.title || ''), done: !!s.done })) : [];
    out.isCompleted = !!r.isCompleted; out.isPinned = !!r.isPinned; out.isBlocked = !!r.isBlocked;
    out.isPrivate = !!r.isPrivate; out.isArchived = !!r.isArchived; out.isDeleted = !!r.isDeleted;
    out.categoryId = r.categoryId != null ? String(r.categoryId) : null;
    for (const k of ['dueDate', 'startDate', 'deletedAt', 'completedAt', 'createdAt', 'updatedAt', 'parentId', 'order', 'recurrenceRule'])
      out[k] = r[k] != null ? r[k] : t[k];
    return out;
  }
  function normalizeCategory(r) {
    if (!r || typeof r !== 'object') return null;
    const c = emptyCategory(); const out = Object.assign(c, r);
    out.id = String(r.id != null ? r.id : c.id);
    out.name = String(r.name != null ? r.name : '');
    if (typeof r.color === 'string' && r.color.startsWith('#')) out.color = hexToColor(r.color);
    else if (typeof r.color === 'number') out.color = r.color;
    return out;
  }
  function normalizeHabit(r) { if (!r) return null; return Object.assign(emptyHabit(), r, { history: r.history || {} }); }
  function normalizeGoal(r) { if (!r) return null; return Object.assign(emptyGoal(), r, { miles: Array.isArray(r.miles) ? r.miles.map((m) => typeof m === 'string' ? { text: m, done: false } : m) : [] }); }
  function normalizeTpl(r) { if (!r) return null; return Object.assign(emptyTpl(), r, { subs: Array.isArray(r.subs) ? r.subs.map(String) : [] }); }

  function toSyncData(st) {
    return {
      version: SYNC_VERSION, lastSync: now(),
      todos: st.todos.map((t) => Object.assign({}, t)),
      categories: st.categories.map((c) => Object.assign({}, c)),
      habits: st.habits.map((h) => Object.assign({}, h)),
      goals: st.goals.map((g) => Object.assign({}, g)),
      templates: st.templates.map((t) => Object.assign({}, t)),
    };
  }
  function fromSyncData(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('文件格式不正确');
    return {
      todos: Array.isArray(obj.todos) ? obj.todos.map(normalizeTodo).filter(Boolean) : [],
      categories: Array.isArray(obj.categories) ? obj.categories.map(normalizeCategory).filter(Boolean) : [],
      habits: Array.isArray(obj.habits) ? obj.habits.map(normalizeHabit).filter(Boolean) : [],
      goals: Array.isArray(obj.goals) ? obj.goals.map(normalizeGoal).filter(Boolean) : [],
      templates: Array.isArray(obj.templates) ? obj.templates.map(normalizeTpl).filter(Boolean) : [],
    };
  }

  /* ============ 3. 存储 ============ */
  const LS = { state: 'lm_web_state_v2', gh: 'lm_web_gh_v1', ai: 'lm_web_ai_v1', theme: 'lm_web_theme' };
  let state = { todos: [], categories: [], habits: [], goals: [], templates: [], settings: { lockEnabled: false, lockPass: '', retention: 30, density: 'comfortable', cheerOn: true, name: '' } };

  function loadState() {
    try {
      const raw = localStorage.getItem(LS.state);
      if (raw) {
        const o = JSON.parse(raw);
        state.todos = (o.todos || []).map(normalizeTodo).filter(Boolean);
        state.categories = (o.categories || []).map(normalizeCategory).filter(Boolean);
        state.habits = (o.habits || []).map(normalizeHabit).filter(Boolean);
        state.goals = (o.goals || []).map(normalizeGoal).filter(Boolean);
        state.templates = (o.templates || []).map(normalizeTpl).filter(Boolean);
        state.settings = Object.assign(state.settings, o.settings || {});
      }
    } catch (e) { console.warn('loadState', e); }
  }
  function saveState() { localStorage.setItem(LS.state, JSON.stringify(state)); }
  function loadCfg(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function saveCfg(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 2400); }
  function catById(id) { return state.categories.find((c) => c.id === id) || null; }

  /* ============ 4. 筛选与排序 ============ */
  let smart = 'all';
  let view = 'list';
  let tableViewSort = { key: 'updatedAt', asc: false };
  const SMART = [
    { k: 'all', t: '全部' }, { k: 'today', t: '今天' }, { k: 'week', t: '本周' },
    { k: 'overdue', t: '已逾期' }, { k: 'nodate', t: '无日期' }, { k: 'pinned', t: '置顶' },
    { k: 'important', t: '重要' }, { k: 'active', t: '未完成' }, { k: 'done', t: '已完成' }, { k: 'private', t: '私密' },
  ];

  function getFilters() {
    return {
      q: $('#searchInput').value.trim().toLowerCase(),
      priority: $('#filterPriority').value,
      status: $('#filterStatus').value,
      category: $('#filterCategory').value,
    };
  }
  function baseTodos() { return state.todos.filter((x) => !x.isDeleted); }
  function visibleTodos() {
    let list = baseTodos();
    const f = getFilters();
    if (f.q) list = list.filter((x) => (x.title || '').toLowerCase().includes(f.q) || (x.description || '').toLowerCase().includes(f.q) || (x.tags || []).some((t) => t.toLowerCase().includes(f.q)));
    if (f.priority) list = list.filter((x) => x.priority === f.priority);
    if (f.status === 'ARCHIVED') list = list.filter((x) => x.isArchived);
    else if (f.status) list = list.filter((x) => x.status === f.status && !x.isArchived);
    if (f.category) list = list.filter((x) => x.categoryId === f.category);
    // 智能清单
    const d = todayStr();
    if (smart === 'today') list = list.filter((x) => x.dueDate && dayStr(x.dueDate) === d && !x.isCompleted);
    else if (smart === 'week') { const end = now() + 7 * 86400000; list = list.filter((x) => x.dueDate && x.dueDate >= now() && x.dueDate <= end); }
    else if (smart === 'overdue') list = list.filter((x) => x.dueDate && x.dueDate < now() && !x.isCompleted);
    else if (smart === 'nodate') list = list.filter((x) => !x.dueDate);
    else if (smart === 'pinned') list = list.filter((x) => x.isPinned);
    else if (smart === 'important') list = list.filter((x) => x.priority === 'HIGH' || x.priority === 'URGENT');
    else if (smart === 'active') list = list.filter((x) => !x.isCompleted && x.status === 'ACTIVE' && !x.isArchived);
    else if (smart === 'done') list = list.filter((x) => x.isCompleted);
    else if (smart === 'private') list = list.filter((x) => x.isPrivate);
    // 私密锁：未解锁则隐藏私密项
    if (state.settings.lockEnabled && !sessionStorage.getItem('lm_unlocked')) list = list.filter((x) => !x.isPrivate);
    return list;
  }
  function sortTodos(list) {
    const so = $('#sortOrder').value;
    const byPrio = (a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
    if (so === 'created_desc') list.sort((a, b) => b.createdAt - a.createdAt);
    else if (so === 'created_asc') list.sort((a, b) => a.createdAt - b.createdAt);
    else if (so === 'due_asc') list.sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));
    else if (so === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title));
    else { // pin_prio：置顶优先，其次 order，再优先级
      list.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return byPrio(a, b);
      });
    }
    return list;
  }

  /* ============ 5. 渲染：列表 ============ */
  function renderStats() {
    const t = baseTodos();
    const active = t.filter((x) => !x.isCompleted && x.status === 'ACTIVE' && !x.isArchived).length;
    const done = t.filter((x) => x.isCompleted).length;
    const archived = t.filter((x) => x.isArchived).length;
    const priv = t.filter((x) => x.isPrivate).length;
    $('#statsBar').innerHTML = `<span>总：${t.length}</span><span>进行中：${active}</span><span>已完成：${done}</span><span>归档：${archived}</span>${priv ? `<span>🔒私密：${priv}</span>` : ''}`;
  }
  function renderCategorySelects() {
    const opts = state.categories.map((c) => `<option value="${c.id}">${esc(c.name || '(未命名)')}</option>`).join('');
    $('#filterCategory').innerHTML = '<option value="">分类</option>' + opts;
    $('#fCategory').innerHTML = '<option value="">（无）</option>' + opts;
    $('#tplPriority') && ($('#tplPriority').innerHTML = PRIORITIES.map((p) => `<option value="${p}">${PRIO_LABEL[p]}</option>`).join(''));
  }
  function renderPriorityOptions() {
    $('#filterPriority').innerHTML = '<option value="">优先级</option>' + PRIORITIES.map((p) => `<option value="${p}">${PRIO_LABEL[p]}</option>`).join('');
    $('#fPriority').innerHTML = PRIORITIES.map((p) => `<option value="${p}">${PRIO_LABEL[p]}</option>`).join('');
    const sOpts = '<option value="">状态</option>' + STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('') + '<option value="ARCHIVED">已归档</option>';
    $('#filterStatus').innerHTML = sOpts;
    $('#fStatus').innerHTML = STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
  }
  function renderSmartChips() {
    $('#smartChips').innerHTML = SMART.map((s) => `<button class="chip ${smart === s.k ? 'active' : ''}" data-smart="${s.k}">${s.t}</button>`).join('');
  }
  function metaHtml(t) {
    const meta = [];
    meta.push(`<span class="pill prio-${t.priority}">${PRIO_LABEL[t.priority]}</span>`);
    if (t.status !== 'ACTIVE') meta.push(`<span class="pill">${STATUS_LABEL[t.status]}</span>`);
    const c = catById(t.categoryId);
    if (c) meta.push(`<span><span class="cat-dot" style="background:${colorToHex(c.color)}"></span>${esc(c.name)}</span>`);
    if (t.dueDate) meta.push(`<span>截止 ${fmtDate(t.dueDate)} · ${dueLabel(t.dueDate)}</span>`);
    if (t.recurrenceRule && t.recurrenceRule !== 'NONE') meta.push(`<span>🔁 ${recLabel(t.recurrenceRule)}</span>`);
    if (t.isBlocked) meta.push(`<span>⛔ 阻塞</span>`);
    if (t.isPrivate) meta.push(`<span>🔒 私密</span>`);
    if (t.subtasks && t.subtasks.length) { const dn = t.subtasks.filter((s) => s.done).length; meta.push(`<span>☑ ${dn}/${t.subtasks.length}</span>`); }
    for (const tg of (t.tags || [])) meta.push(`<span class="tag">${esc(tg)}</span>`);
    return meta.join('');
  }
  function recLabel(r) { if (!r || r === 'NONE') return '不重复'; return { DAILY: '每天', WEEKLY: '每周', MONTHLY: '每月' }[r] || '重复'; }

  function renderTodos() {
    const list = sortTodos(visibleTodos());
    const ul = $('#todoList'); ul.innerHTML = '';
    $('#emptyHint').hidden = list.length > 0;
    for (const t of list) {
      const li = document.createElement('li');
      li.className = 'todo-item' + (t.isCompleted ? ' done' : '') + (t.isPinned ? ' pinned' : '') + (t.isPrivate ? ' private' : '');
      li.draggable = true; li.dataset.id = t.id;
      const subHtml = (t.subtasks && t.subtasks.length) ? `<ul class="subtask-list">${t.subtasks.map((s) => `<li class="${s.done ? 'done' : ''}"><input type="checkbox" data-sub="${t.id}" data-sid="${s.id}" ${s.done ? 'checked' : ''}/> ${esc(s.title)}</li>`).join('')}</ul>` : '';
      li.innerHTML = `
        <input type="checkbox" class="batch-check" data-batch="${t.id}" />
        <span class="drag-handle" title="拖拽排序">⋮⋮</span>
        <input type="checkbox" class="todo-check" ${t.isCompleted ? 'checked' : ''} data-id="${t.id}" />
        <div class="todo-main">
          <div class="todo-title">${esc(t.title || '(无标题)')}${t.isPinned ? '<span class="pin">📌</span>' : ''}</div>
          <div class="todo-meta">${metaHtml(t)}</div>
          ${subHtml}
        </div>
        <div class="todo-actions">
          <button class="icon-mini" data-edit="${t.id}" title="编辑">✏️</button>
          <button class="icon-mini" data-del="${t.id}" title="删除">🗑️</button>
        </div>`;
      ul.appendChild(li);
    }
    renderStats();
    if (view === 'kanban') renderKanban();
    if (view === 'quadrant') renderQuadrant();
    if (view === 'table') renderTable();
  }

  /* 看板 */
  function renderKanban() {
    const cols = [{ s: 'ACTIVE', t: '进行中' }, { s: 'PAUSED', t: '暂停' }, { s: 'CANCELLED', t: '已取消' }, { s: 'done', t: '已完成' }];
    const box = $('#kanban'); box.innerHTML = '';
    for (const col of cols) {
      const items = visibleTodos().filter((x) => col.s === 'done' ? x.isCompleted : (!x.isCompleted && x.status === col.s));
      const div = document.createElement('div'); div.className = 'kcol';
      div.innerHTML = `<h4>${col.t} (${items.length})</h4>` + items.map((t) => `<div class="kcard" data-edit="${t.id}">${esc(t.title)}<div class="todo-meta">${metaHtml(t)}</div></div>`).join('');
      box.appendChild(div);
    }
  }
  /* 四象限 */
  function renderQuadrant() {
    const cells = [
      { c: 'q-urg-imp', t: '重要且紧急', f: (x) => imp(x) && urg(x) },
      { c: 'q-imp', t: '重要不紧急', f: (x) => imp(x) && !urg(x) },
      { c: '', t: '紧急不重要', f: (x) => !imp(x) && urg(x) },
      { c: '', t: '不重要不紧急', f: (x) => !imp(x) && !urg(x) },
    ];
    const box = $('#quadrant'); box.innerHTML = '';
    for (const cell of cells) {
      const items = visibleTodos().filter((x) => !x.isCompleted && cell.f(x));
      const div = document.createElement('div'); div.className = 'qcell ' + cell.c;
      div.innerHTML = `<h4>${cell.t} (${items.length})</h4>` + items.map((t) => `<div class="kcard" data-edit="${t.id}">${esc(t.title)}</div>`).join('');
      box.appendChild(div);
    }
  }
  function imp(x) { return x.priority === 'HIGH' || x.priority === 'URGENT'; }
  function urg(x) { return x.dueDate && (x.dueDate - now()) <= 48 * 3600000; }
  /* 表格 */
  function renderTable() {
    const cols = [['title', '标题'], ['priority', '优先级'], ['category', '分类'], ['due', '截止'], ['status', '状态'], ['tags', '标签'], ['updated', '更新']];
    let list = visibleTodos().slice();
    list.sort((a, b) => {
      let va, vb;
      const k = tableViewSort.key;
      if (k === 'title') { va = a.title; vb = b.title; }
      else if (k === 'priority') { va = PRIORITIES.indexOf(a.priority); vb = PRIORITIES.indexOf(b.priority); }
      else if (k === 'category') { va = (catById(a.categoryId) || {}).name || ''; vb = (catById(b.categoryId) || {}).name || ''; }
      else if (k === 'due') { va = a.dueDate || 0; vb = b.dueDate || 0; }
      else if (k === 'status') { va = a.status; vb = b.status; }
      else if (k === 'tags') { va = a.tags.join(); vb = b.tags.join(); }
      else { va = a.updatedAt; vb = b.updatedAt; }
      if (va < vb) return tableViewSort.asc ? -1 : 1; if (va > vb) return tableViewSort.asc ? 1 : -1; return 0;
    });
    const tbl = $('#todoTable');
    tbl.innerHTML = '<thead><tr>' + cols.map((c) => `<th data-col="${c[0]}">${c[1]}${tableViewSort.key === c[0] ? (tableViewSort.asc ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>' +
      list.map((t) => `<tr data-edit="${t.id}"><td>${esc(t.title)}</td><td>${PRIO_LABEL[t.priority]}</td><td>${(catById(t.categoryId) || {}).name || ''}</td><td>${t.dueDate ? fmtDate(t.dueDate) : ''}</td><td>${STATUS_LABEL[t.status]}</td><td>${esc(t.tags.join(', '))}</td><td>${fmtDate(t.updatedAt)}</td></tr>`).join('') + '</tbody>';
  }

  /* ============ 6. 待办编辑 ============ */
  let editingId = null;
  let editingSubs = [];
  function openTodoModal(t) {
    editingId = t ? t.id : null;
    editingSubs = t && t.subtasks ? t.subtasks.map((s) => Object.assign({}, s)) : [];
    $('#todoModalTitle').textContent = t ? '编辑待办' : '新建待办';
    $('#fTitle').value = t ? t.title : '';
    $('#fDesc').value = t ? t.description : '';
    $('#fPriority').value = t ? t.priority : 'MEDIUM';
    $('#fStatus').value = t ? t.status : 'ACTIVE';
    $('#fCategory').value = t && t.categoryId ? t.categoryId : '';
    $('#fDue').value = t ? tsToDateInput(t.dueDate) : '';
    $('#fStart').value = t ? tsToDateInput(t.startDate) : '';
    $('#fRecur').value = t && t.recurrenceRule ? t.recurrenceRule : 'NONE';
    $('#fTags').value = t && t.tags ? t.tags.join(', ') : '';
    $('#fPinned').checked = t ? !!t.isPinned : false;
    $('#fBlocked').checked = t ? !!t.isBlocked : false;
    $('#fPrivate').checked = t ? !!t.isPrivate : false;
    $('#fArchived').checked = t ? !!t.isArchived : false;
    renderSubtaskEditor();
    $('#todoModal').hidden = false;
  }
  function renderSubtaskEditor() {
    $('#subtaskList').innerHTML = editingSubs.map((s) => `<li class="${s.done ? 'done' : ''}"><input type="checkbox" data-sid="${s.id}" ${s.done ? 'checked' : ''}/> ${esc(s.title)} <button class="icon-mini" data-subdel="${s.id}">✕</button></li>`).join('');
  }
  function closeTodoModal() { $('#todoModal').hidden = true; editingId = null; editingSubs = []; }
  function saveTodo() {
    const title = $('#fTitle').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const data = {
      title, description: $('#fDesc').value.trim(), priority: $('#fPriority').value, status: $('#fStatus').value,
      categoryId: $('#fCategory').value || null,
      dueDate: $('#fDue').value ? new Date($('#fDue').value + 'T00:00:00').getTime() : null,
      startDate: $('#fStart').value ? new Date($('#fStart').value + 'T00:00:00').getTime() : null,
      recurrenceRule: $('#fRecur').value === 'NONE' ? null : $('#fRecur').value,
      tags: $('#fTags').value.split(',').map((s) => s.trim()).filter(Boolean),
      isPinned: $('#fPinned').checked, isBlocked: $('#fBlocked').checked, isPrivate: $('#fPrivate').checked,
      isArchived: $('#fArchived').checked, subtasks: editingSubs, updatedAt: now(),
    };
    if (editingId) {
      const i = state.todos.findIndex((x) => x.id === editingId);
      if (i >= 0) state.todos[i] = Object.assign({}, state.todos[i], data);
    } else { state.todos.push(emptyTodo(Object.assign({ order: now() }, data))); }
    saveState(); renderTodos(); closeTodoModal(); toast('已保存');
  }
  function deleteTodo(id) {
    const i = state.todos.findIndex((x) => x.id === id);
    if (i >= 0) { state.todos[i] = Object.assign({}, state.todos[i], { isDeleted: true, deletedAt: now(), updatedAt: now() }); saveState(); renderTodos(); toast('已移入回收站'); }
  }
  function restoreTodo(id) {
    const i = state.todos.findIndex((x) => x.id === id);
    if (i >= 0) { state.todos[i] = Object.assign({}, state.todos[i], { isDeleted: false, deletedAt: null, updatedAt: now() }); saveState(); renderTodos(); toast('已恢复'); }
  }
  function purgeTodo(id) {
    state.todos = state.todos.filter((x) => x.id !== id); saveState(); renderTodos(); toast('已彻底删除');
  }
  function toggleDone(id, val) {
    const t = state.todos.find((x) => x.id === id);
    if (!t) return;
    t.isCompleted = val; t.completedAt = val ? now() : null; t.updatedAt = now();
    if (val && t.recurrenceRule && t.recurrenceRule !== 'NONE') spawnRecurrence(t);
    saveState(); renderTodos();
    if (val && state.settings.cheerOn) toast(cheer());
  }
  function spawnRecurrence(t) {
    let next = null;
    if (t.recurrenceRule === 'DAILY') next = now() + 86400000;
    else if (t.recurrenceRule === 'WEEKLY') next = now() + 7 * 86400000;
    else if (t.recurrenceRule === 'MONTHLY') { const d = new Date(now()); d.setMonth(d.getMonth() + 1); next = d.getTime(); }
    if (next == null) return;
    state.todos.push(emptyTodo({
      title: t.title, description: t.description, priority: t.priority, categoryId: t.categoryId,
      tags: t.tags.slice(), recurrenceRule: t.recurrenceRule, dueDate: next, startDate: now(),
      isPinned: false, isPrivate: t.isPrivate, status: 'ACTIVE', order: now(),
    }));
  }
  const CHEERS = ['搞定！🎉', '又进一步 💪', '漂亮 ✨', '继续保持 🔥', '这件完成了 👍'];
  function cheer() { return CHEERS[Math.floor(Math.random() * CHEERS.length)]; }

  /* ============ 7. 分类 ============ */
  function renderCatList() {
    const ul = $('#catList'); ul.innerHTML = '';
    for (const c of state.categories) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="cat-dot" style="background:${colorToHex(c.color)}"></span><span class="grow">${esc(c.name || '(未命名)')} <span class="muted">· ${esc(c.icon)}</span></span><button class="icon-mini" data-catedit="${c.id}">✏️</button><button class="icon-mini" data-catdel="${c.id}">🗑️</button>`;
      ul.appendChild(li);
    }
  }
  function openCatModal() { renderCatList(); $('#catModal').hidden = false; }

  /* ============ 8. 习惯 ============ */
  function renderHabits() {
    const box = $('#habitList'); box.innerHTML = '';
    for (const h of state.habits) {
      const d = todayStr();
      const todayCnt = h.history[d] || 0;
      const done = todayCnt >= h.target;
      const streak = habitStreak(h);
      const heat = habitHeat(h);
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `
        <h3>${h.icon} ${esc(h.name)} <span class="muted">${streak}天连续</span></h3>
        <div>今日 ${todayCnt}/${h.target} ${done ? '✅' : ''}</div>
        <div class="heat">${heat.map((on) => `<i class="${on === 2 ? 'part' : on ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row">
          <button class="mini" data-hcheck="${h.id}">打卡</button>
          <button class="mini" data-hminus="${h.id}">-1</button>
          <button class="mini" data-hedit="${h.id}">编辑</button>
          <button class="mini danger" data-hdel="${h.id}">删除</button>
        </div>`;
      box.appendChild(card);
    }
  }
  function habitStreak(h) {
    let s = 0; const today = new Date();
    for (let i = 0; i < 400; i++) {
      const ds = dayStr(today.getTime() - i * 86400000);
      const c = h.history[ds] || 0;
      if (c >= h.target) s++;
      else if (i === 0) continue; // 今天还没打卡不算断
      else break;
    }
    return s;
  }
  function habitHeat(h) {
    const out = []; const today = new Date();
    for (let i = 29; i >= 0; i--) { const ds = dayStr(today.getTime() - i * 86400000); const c = h.history[ds] || 0; out.push(c >= h.target ? 2 : c > 0 ? 1 : 0); }
    return out;
  }
  function habitCheck(id, delta) {
    const h = state.habits.find((x) => x.id === id); if (!h) return;
    const d = todayStr(); const cur = h.history[d] || 0; const nv = Math.max(0, cur + delta);
    if (nv === 0) delete h.history[d]; else h.history[d] = nv;
    saveState(); renderHabits();
  }
  let editingHabit = null;
  function openHabitModal(h) {
    editingHabit = h ? h.id : null;
    $('#habitModalTitle').textContent = h ? '编辑习惯' : '新建习惯';
    $('#hName').value = h ? h.name : ''; $('#hIcon').value = h ? h.icon : '✅';
    $('#hPeriod').value = h ? String(h.period) : '1'; $('#hTarget').value = h ? h.target : 1;
    $('#habitModal').hidden = false;
  }

  /* ============ 9. 目标 ============ */
  function renderGoals() {
    const box = $('#goalList'); box.innerHTML = '';
    for (const g of state.goals) {
      const pct = g.target > 0 ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `
        <h3>${esc(g.title)}</h3>
        <div>${g.current} / ${g.target} ${g.unit ? g.unit : ''} （${pct}%）</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${g.miles.length ? `<ul class="miles">${g.miles.map((m, i) => `<li class="${m.done ? 'done' : ''}"><input type="checkbox" data-mcheck="${g.id}" data-mi="${i}" ${m.done ? 'checked' : ''}/> ${esc(m.text)}</li>`).join('')}</ul>` : ''}
        <div class="row">
          <button class="mini" data-gplus="${g.id}">+1</button>
          <button class="mini" data-gminus="${g.id}">-1</button>
          <button class="mini" data-gedit="${g.id}">编辑</button>
          <button class="mini danger" data-gdel="${g.id}">删除</button>
        </div>`;
      box.appendChild(card);
    }
  }
  let editingGoal = null;
  function openGoalModal(g) {
    editingGoal = g ? g.id : null;
    $('#goalModalTitle').textContent = g ? '编辑目标' : '新建目标';
    $('#gTitle').value = g ? g.title : ''; $('#gTarget').value = g ? g.target : 100; $('#gUnit').value = g ? g.unit : '';
    $('#gMiles').value = g ? g.miles.map((m) => m.text).join('\n') : '';
    $('#goalModal').hidden = false;
  }

  /* ============ 10. 模板 ============ */
  const BUILTIN_TPLS = [
    { name: '新员工入职', icon: '🧑‍💼', title: '新员工入职第一天', priority: 'HIGH', subs: ['办理工牌', '配置电脑', '加入团队群', '阅读员工手册', '认识直属上级'] },
    { name: '出差打包', icon: '🧳', title: '出差打包', priority: 'MEDIUM', subs: ['证件/车票', '充电器', '衣物', '洗漱包', '常用药品'] },
    { name: '周会准备', icon: '📅', title: '周会准备', priority: 'MEDIUM', subs: ['汇总本周进展', '列出 blockers', '准备下周计划'] },
    { name: '版本发布检查', icon: '🚀', title: '版本发布检查', priority: 'URGENT', subs: ['跑测试', '更新变更日志', '打 tag', '通知团队', '监控线上'] },
    { name: '每周复盘', icon: '🪞', title: '每周复盘', priority: 'LOW', subs: ['本周完成', '本周不足', '下周重点'] },
    { name: '日常采购', icon: '🛒', title: '日常采购', priority: 'LOW', subs: ['果蔬', '主食', '日用品'] },
  ];
  function renderTemplates() {
    const box = $('#tplList'); box.innerHTML = '';
    const all = BUILTIN_TPLS.map((b) => Object.assign({ builtin: true, id: 'b_' + b.name }, b))
      .concat(state.templates.map((t) => Object.assign({ builtin: false }, t)));
    for (const t of all) {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<h3>${t.icon} ${esc(t.name)}</h3><div class="muted">${t.subs.length} 个子任务</div>
        <div class="row"><button class="mini" data-tapply="${t.id}">应用</button>${t.builtin ? '' : `<button class="mini danger" data-tdel="${t.id}">删除</button><button class="mini" data-tedit="${t.id}">编辑</button>`}</div>`;
      box.appendChild(card);
    }
  }
  function applyTemplate(id) {
    const b = BUILTIN_TPLS.find((x) => 'b_' + x.name === id);
    const cust = state.templates.find((x) => x.id === id);
    const src = b || cust; if (!src) return;
    state.todos.push(emptyTodo({
      title: src.title || src.name, priority: src.priority || 'MEDIUM',
      subtasks: (src.subs || []).map((s) => ({ id: genId('sub'), title: typeof s === 'string' ? s : s.title, done: false })),
      order: now(),
    }));
    saveState(); renderTodos(); toast('已从模板创建待办');
  }
  let editingTpl = null;
  function openTplModal(t) {
    editingTpl = t ? t.id : null;
    $('#tplModalTitle').textContent = t ? '编辑模板' : '新建模板';
    $('#tName').value = t ? t.name : ''; $('#tIcon').value = t ? t.icon : '📋';
    $('#tTitle').value = t ? t.title : ''; $('#tPriority').value = t ? t.priority : 'MEDIUM';
    $('#tSubs').value = t ? t.subs.join('\n') : '';
    if (!$('#tplPriority').innerHTML) $('#tplPriority').innerHTML = PRIORITIES.map((p) => `<option value="${p}">${PRIO_LABEL[p]}</option>`).join('');
    $('#tplModal').hidden = false;
  }

  /* ============ 11. 回顾复盘 ============ */
  function renderReview() {
    const days = parseInt($('#reviewRange').value, 10) || 30;
    const from = now() - days * 86400000;
    const t = baseTodos();
    const created = t.filter((x) => x.createdAt >= from).length;
    const done = t.filter((x) => x.completedAt && x.completedAt >= from).length;
    const overdue = t.filter((x) => x.dueDate && x.dueDate < now() && !x.isCompleted).length;
    const rate = created > 0 ? Math.round(done / created * 100) : 0;
    const byCat = {};
    for (const x of t) if (x.completedAt && x.completedAt >= from) { const n = (catById(x.categoryId) || {}).name || '未分类'; byCat[n] = (byCat[n] || 0) + 1; }
    const byPrio = {};
    for (const x of t) if (x.completedAt && x.completedAt >= from) byPrio[x.priority] = (byPrio[x.priority] || 0) + 1;
    const catStr = Object.entries(byCat).map(([k, v]) => `${k}: ${v}`).join('，') || '无';
    const prioStr = Object.entries(byPrio).map(([k, v]) => `${PRIO_LABEL[k]}: ${v}`).join('，') || '无';
    $('#reviewOut').innerHTML = `
      <div class="box"><div class="big">${done}</div>近 ${days} 天完成</div>
      <div class="box">新建 ${created} · 完成率 ${rate}% · 当前逾期 ${overdue}</div>
      <div class="box">按分类：${catStr}</div>
      <div class="box">按优先级：${prioStr}</div>
      <div class="box">${reviewText(days, created, done, rate, overdue)}</div>`;
  }
  function reviewText(days, created, done, rate, overdue) {
    return `【轻刻复盘 · 近${days}天】\n新建 ${created} 项，完成 ${done} 项（完成率 ${rate}%），当前逾期 ${overdue} 项。\n建议：优先清理逾期任务，保持每日推进。`;
  }
  function reviewTidy() {
    let moved = 0;
    for (const t of baseTodos()) {
      if (t.dueDate && t.dueDate < now() && !t.isCompleted) { t.dueDate = now(); t.updatedAt = now(); moved++; }
    }
    const days = parseInt(state.settings.retention || 30, 10);
    if (days > 0) {
      const cut = now() - days * 86400000;
      for (const t of state.todos) if (t.isDeleted && t.deletedAt && t.deletedAt < cut) t.purge = true;
      state.todos = state.todos.filter((x) => !x.purge);
    }
    saveState(); renderTodos(); renderReview(); toast(`已顺延 ${moved} 项逾期任务到今天`);
  }

  /* ============ 12. GitHub 同步 ============ */
  async function ghRequest(path, { method = 'GET', token, body } = {}) {
    const res = await fetch('https://api.github.com' + path, {
      method, headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) { let m = `${res.status} ${res.statusText}`; try { const j = await res.json(); if (j && j.message) m = j.message; } catch (e) {} throw new Error(m); }
    return res.json();
  }
  async function ghRead(cfg) {
    const q = cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '';
    const data = await ghRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_FILE}${q}`, { token: cfg.token });
    return { data: JSON.parse(b64decode(data.content)), sha: data.sha };
  }
  async function ghWrite(cfg, content, sha) {
    const body = { message: 'lightmark: sync ' + new Date().toISOString(), content: b64encode(content) };
    if (sha) body.sha = sha; if (cfg.branch) body.branch = cfg.branch;
    return ghRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_FILE}`, { method: 'PUT', token: cfg.token, body });
  }
  function readGhCfg() { const c = loadCfg(LS.gh); return { owner: c.owner || '', repo: c.repo || 'lightmark-data', branch: c.branch || 'main', token: c.token || '' }; }
  async function ghPull() {
    const cfg = readGhCfg(); if (!cfg.owner || !cfg.repo || !cfg.token) { toast('请先填写并保存 GitHub 配置'); return; }
    setGhStatus('拉取中…');
    try { const { data } = await ghRead(cfg); const inc = fromSyncData(data); mergeFrom(inc); saveState(); renderAll(); setGhStatus('✅ 已拉取'); toast('已从 GitHub 拉取'); }
    catch (e) { setGhStatus('❌ ' + e.message); toast('拉取失败：' + e.message); }
  }
  async function ghPush() {
    const cfg = readGhCfg(); if (!cfg.owner || !cfg.repo || !cfg.token) { toast('请先填写并保存 GitHub 配置'); return; }
    setGhStatus('推送中…');
    try {
      let sha = null; try { const r = await ghRead(cfg); sha = r.sha; } catch (e) {}
      await ghWrite(cfg, JSON.stringify(toSyncData(state), null, 2), sha);
      setGhStatus('✅ 已推送 ' + state.todos.length + ' 条'); toast('已推送到 GitHub');
    } catch (e) { setGhStatus('❌ ' + e.message); toast('推送失败：' + e.message); }
  }
  function setGhStatus(s) { $('#ghStatus').textContent = s; }
  function mergeFrom(inc) {
    const merge = (local, arr) => { const m = new Map(local.map((x) => [x.id, x])); for (const it of arr) { const ex = m.get(it.id); if (!ex || (it.updatedAt || 0) >= (ex.updatedAt || 0)) m.set(it.id, it); } return Array.from(m.values()); };
    state.todos = merge(state.todos, inc.todos); state.categories = merge(state.categories, inc.categories);
    if (inc.habits) state.habits = merge(state.habits, inc.habits);
    if (inc.goals) state.goals = merge(state.goals, inc.goals);
    if (inc.templates) state.templates = merge(state.templates, inc.templates);
  }

  /* ============ 13. 导入 / 导出 ============ */
  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  function exportJson() { download(DATA_FILE, JSON.stringify(toSyncData(state), null, 2)); toast('已导出 JSON'); }
  function exportMd() {
    const lines = ['# 轻刻导出', ''];
    for (const t of baseTodos()) { const box = t.isCompleted ? '- [x]' : '- [ ]'; lines.push(`${box} **${t.title}** （${PRIO_LABEL[t.priority]}）${t.dueDate ? ' · ' + fmtDate(t.dueDate) : ''}`); for (const s of (t.subtasks || [])) lines.push(`  - ${s.done ? '[x]' : '[ ]'} ${s.title}`); }
    download('lightmark.md', lines.join('\n')); toast('已导出 Markdown');
  }
  function csvCell(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    const head = ['标题', '优先级', '状态', '分类', '截止', '标签', '私密', '归档'];
    const rows = baseTodos().map((t) => [t.title, PRIO_LABEL[t.priority], STATUS_LABEL[t.status], (catById(t.categoryId) || {}).name || '', t.dueDate ? fmtDate(t.dueDate) : '', t.tags.join('/'), t.isPrivate ? '是' : '', t.isArchived ? '是' : ''].map(csvCell).join(','));
    download('lightmark.csv', '﻿' + head.map(csvCell).join('\n') + '\n' + rows.join('\n')); toast('已导出 CSV');
  }
  function exportIcs() {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LightMark//WEB//CN'];
    for (const t of baseTodos()) { if (!t.dueDate) continue; const ds = new Date(t.dueDate).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); lines.push('BEGIN:VTODO', `UID:${t.id}@lightmark`, `SUMMARY:${t.title}`, `DUE:${ds}`, t.description ? `DESCRIPTION:${t.description.replace(/\n/g, ' ')}` : '', 'END:VTODO'); }
    lines.push('END:VCALENDAR'); download('lightmark.ics', lines.join('\r\n')); toast('已导出 .ics');
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => { try { const inc = fromSyncData(JSON.parse(reader.result)); mergeFrom(inc); saveState(); renderAll(); toast(`已导入 ${inc.todos.length} 待办`); } catch (e) { toast('导入失败：' + e.message); } };
    reader.readAsText(file);
  }

  /* ============ 14. AI ============ */
  function readAiCfg() { const c = loadCfg(LS.ai); return { base: c.base || '', key: c.key || '', model: c.model || 'gpt-3.5-turbo' }; }
  async function aiChat(messages, cfg) {
    if (!cfg || !cfg.base || !cfg.key) return localChat(messages);
    const res = await fetch(cfg.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: cfg.model || 'gpt-3.5-turbo', messages, temperature: 0.7 }) });
    if (!res.ok) { let m = `${res.status}`; try { const j = await res.json(); m = (j && j.error && j.error.message) || m; } catch (e) {} throw new Error(m); }
    const j = await res.json(); return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
  }
  function localChat(messages) { const last = messages.filter((m) => m.role === 'user').pop(); const text = (last && last.content) || ''; return '（本机规则模式）我已离线，仅做基础处理。你可粘贴一段话点「生成待办」拆任务，或填 OpenAI 兼容 Key 启用联网 AI。\n你刚才说：' + text.slice(0, 120); }
  function localGenerate(text) { const lines = text.split(/\n+/).map((s) => s.replace(/^[\s\d.\-、)*]+\s*/, '').trim()).filter(Boolean); return lines.map((t) => emptyTodo({ title: t.slice(0, 80) })); }
  function extractJsonArray(s) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch (e) {} const i = s.indexOf('['), j = s.lastIndexOf(']'); if (i >= 0 && j > i) { try { const a = JSON.parse(s.slice(i, j + 1)); if (Array.isArray(a)) return a; } catch (e) {} } return null; }
  let pendingTodos = [];
  function showAiResult(text, asTodos) { const el = $('#aiResult'); el.hidden = false; el.textContent = text; pendingTodos = asTodos || []; $('#aiApply').hidden = !(asTodos && asTodos.length); }
  async function aiGenerate() {
    const text = $('#aiInput').value.trim(); if (!text) { toast('请先输入内容'); return; }
    const cfg = readAiCfg();
    try {
      if (cfg.base && cfg.key) {
        const sys = '你是任务拆解助手。把用户的文字整理成待办清单，只输出 JSON 数组，元素形如 {"title":"...","priority":"MEDIUM|HIGH|LOW|URGENT|IDLE","tags":["..."]}。不要多余解释。';
        const out = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: text }], cfg);
        const arr = extractJsonArray(out);
        if (arr) { const todos = arr.map((x) => emptyTodo({ title: String(x.title || '').slice(0, 80), priority: PRIORITIES.includes(x.priority) ? x.priority : 'MEDIUM', tags: Array.isArray(x.tags) ? x.tags.map(String) : [], description: x.description ? String(x.description) : '' })); showAiResult(todos.map((t) => '• ' + t.title).join('\n'), todos); toast('AI 生成 ' + todos.length + ' 条'); return; }
        showAiResult(out, localGenerate(text)); return;
      }
      const todos = localGenerate(text); showAiResult(todos.map((t) => '• ' + t.title).join('\n'), todos); toast('本机生成 ' + todos.length + ' 条');
    } catch (e) { showAiResult('生成失败：' + e.message, null); }
  }
  async function aiPolish() { const text = $('#aiInput').value.trim(); if (!text) { toast('请先输入内容'); return; } const cfg = readAiCfg(); try { const out = cfg.base && cfg.key ? await aiChat([{ role: 'system', content: '你是文本润色助手，只返回润色后的文本。' }, { role: 'user', content: text }], cfg) : text.replace(/\s+/g, ' ').trim(); showAiResult(out, null); } catch (e) { showAiResult('润色失败：' + e.message, null); } }
  async function aiSummarize() { const text = $('#aiInput').value.trim(); if (!text) { toast('请先输入内容'); return; } const cfg = readAiCfg(); try { const out = cfg.base && cfg.key ? await aiChat([{ role: 'system', content: '你是总结助手，用带编号要点总结。' }, { role: 'user', content: text }], cfg) : text.split(/[。！？\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n') || '（内容过短）'; showAiResult(out, null); } catch (e) { showAiResult('总结失败：' + e.message, null); } }
  function applyAiTodos() { if (!pendingTodos.length) return; state.todos.push(...pendingTodos); saveState(); renderTodos(); toast('已加入 ' + pendingTodos.length + ' 条'); pendingTodos = []; $('#aiApply').hidden = true; $('#aiResult').hidden = true; }
  let chatMsgs = [];
  function renderChat() { const log = $('#chatLog'); log.innerHTML = ''; for (const m of chatMsgs) { const b = document.createElement('div'); b.className = 'bubble ' + (m.role === 'user' ? 'user' : 'ai'); b.textContent = m.content; log.appendChild(b); } log.scrollTop = log.scrollHeight; }
  async function chatSend() { const v = $('#chatInput').value.trim(); if (!v) return; chatMsgs.push({ role: 'user', content: v }); $('#chatInput').value = ''; renderChat(); const cfg = readAiCfg(); try { const out = await aiChat(chatMsgs.slice(), cfg); chatMsgs.push({ role: 'assistant', content: out }); } catch (e) { chatMsgs.push({ role: 'assistant', content: '出错了：' + e.message }); } renderChat(); }

  /* ============ 15. 番茄钟 ============ */
  let pomo = { t: 25 * 60, left: 25 * 60, running: false, mode: '专注', iv: null };
  function renderPomo() { const m = Math.floor(pomo.left / 60), s = pomo.left % 60; $('#pomoTime').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; $('#pomoMode').textContent = pomo.mode; }
  function pomoStart() { if (pomo.running) { clearInterval(pomo.iv); pomo.running = false; $('#pomoStart').textContent = '继续'; return; } pomo.running = true; $('#pomoStart').textContent = '暂停'; pomo.iv = setInterval(() => { if (pomo.left > 0) { pomo.left--; renderPomo(); } else { clearInterval(pomo.iv); pomo.running = false; if (pomo.mode === '专注') { pomo.mode = '休息'; pomo.left = 5 * 60; } else { pomo.mode = '专注'; pomo.left = 25 * 60; } $('#pomoStart').textContent = '开始'; renderPomo(); toast(pomo.mode === '休息' ? '专注结束，休息一下 ☕' : '休息结束，开始专注 💪'); } }, 1000); }
  function pomoReset() { clearInterval(pomo.iv); pomo.running = false; pomo.mode = '专注'; pomo.left = 25 * 60; $('#pomoStart').textContent = '开始'; renderPomo(); }

  /* ============ 16. 应用锁 ============ */
  function maybeLock() {
    if (state.settings.lockEnabled && state.settings.lockPass && !sessionStorage.getItem('lm_unlocked')) {
      $('#unlockModal').hidden = false;
    }
  }
  function tryUnlock() {
    const v = $('#unlockPass').value;
    if (v === state.settings.lockPass) { sessionStorage.setItem('lm_unlocked', '1'); $('#unlockModal').hidden = true; renderTodos(); toast('已解锁'); }
    else { $('#unlockErr').textContent = '密码错误'; }
  }
  function applyLockSettings() {
    state.settings.lockEnabled = $('#lockEnabled').checked;
    const p = $('#lockPass').value.trim();
    if (p) state.settings.lockPass = p;
    saveState();
    $('#lockHint').textContent = state.settings.lockEnabled ? '已启用，私密内容需解锁查看。' : '未启用。';
    toast('应用锁设置已保存');
    if (!state.settings.lockEnabled) { sessionStorage.removeItem('lm_unlocked'); renderTodos(); }
  }

  /* ============ 17. 主题 ============ */
  function applyTheme(t) { document.body.setAttribute('data-theme', t); localStorage.setItem(LS.theme, t); }

  /* ============ 18. 全量渲染 ============ */
  function renderAll() {
    renderPriorityOptions(); renderCategorySelects(); renderSmartChips();
    renderTodos(); renderHabits(); renderGoals(); renderTemplates(); renderReview();
  }

  /* ============ 19. 事件绑定 ============ */
  function bind() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.remove('active')); $$('.panel').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); $('#panel-' + b.dataset.tab).classList.add('active');
      if (b.dataset.tab === 'todo') renderTodos(); if (b.dataset.tab === 'review') renderReview();
    }));
    $$('.vbtn').forEach((b) => b.addEventListener('click', () => {
      $$('.vbtn').forEach((x) => x.classList.remove('active')); b.classList.add('active'); view = b.dataset.view;
      ['list', 'kanban', 'quadrant', 'table'].forEach((v) => { $('#view-' + v).hidden = v !== view; });
      renderTodos();
    }));
    $('#smartChips').addEventListener('click', (e) => { const c = e.target.dataset.smart; if (c) { smart = c; renderSmartChips(); renderTodos(); } });
    $('#searchInput').addEventListener('input', renderTodos);
    $('#filterPriority').addEventListener('change', renderTodos);
    $('#filterStatus').addEventListener('change', renderTodos);
    $('#filterCategory').addEventListener('change', renderTodos);
    $('#sortOrder').addEventListener('change', renderTodos);
    $('#addTodoBtn').addEventListener('click', () => openTodoModal(null));
    $('#manageCatBtn') && $('#manageCatBtn').addEventListener('click', openCatModal);
    $('#todoList').addEventListener('click', (e) => {
      const ed = e.target.dataset.edit, dl = e.target.dataset.del, sub = e.target.dataset.sub, sid = e.target.dataset.sid;
      if (ed) { const t = state.todos.find((x) => x.id === ed); if (t) openTodoModal(t); }
      else if (dl) deleteTodo(dl);
      else if (sub && sid) { const t = state.todos.find((x) => x.id === sub); if (t) { const s = t.subtasks.find((x) => x.id === sid); if (s) { s.done = e.target.checked; t.updatedAt = now(); saveState(); renderTodos(); } } }
    });
    $('#todoList').addEventListener('change', (e) => { if (e.target.classList.contains('todo-check')) toggleDone(e.target.dataset.id, e.target.checked); });
    $('#todoSave').addEventListener('click', saveTodo);
    $('#todoCancel').addEventListener('click', closeTodoModal);

    // 看板 / 四象限 / 表格：点击卡片打开编辑 + 表头排序
    const openFromEl = (el) => { const id = el && el.dataset.edit; if (id) { const t = state.todos.find((x) => x.id === id); if (t) openTodoModal(t); } };
    $('#kanban').addEventListener('click', (e) => { const c = e.target.closest('[data-edit]'); if (c) openFromEl(c); });
    $('#quadrant').addEventListener('click', (e) => { const c = e.target.closest('[data-edit]'); if (c) openFromEl(c); });
    $('#todoTable').addEventListener('click', (e) => {
      const th = e.target.closest('th');
      if (th) { const col = th.dataset.col; if (tableViewSort.key === col) tableViewSort.asc = !tableViewSort.asc; else { tableViewSort.key = col; tableViewSort.asc = true; } renderTable(); return; }
      const tr = e.target.closest('tr[data-edit]'); if (tr) openFromEl(tr);
    });

    // 拖拽排序
    let dragId = null;
    $('#todoList').addEventListener('dragstart', (e) => { const li = e.target.closest('.todo-item'); if (li) { dragId = li.dataset.id; li.classList.add('dragging'); } });
    $('#todoList').addEventListener('dragend', (e) => { const li = e.target.closest('.todo-item'); if (li) li.classList.remove('dragging'); });
    $('#todoList').addEventListener('dragover', (e) => { e.preventDefault(); });
    $('#todoList').addEventListener('drop', (e) => {
      e.preventDefault(); const li = e.target.closest('.todo-item'); if (!li || !dragId || li.dataset.id === dragId) return;
      const ids = sortTodos(visibleTodos()).map((x) => x.id);
      const from = ids.indexOf(dragId), to = ids.indexOf(li.dataset.id); if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      ids.forEach((id, i) => { const t = state.todos.find((x) => x.id === id); if (t) t.order = i * 1000 + 1; });
      saveState(); renderTodos();
    });

    // 子任务编辑
    $('#subAdd').addEventListener('click', () => { const v = $('#subInput').value.trim(); if (!v) return; editingSubs.push({ id: genId('sub'), title: v, done: false }); $('#subInput').value = ''; renderSubtaskEditor(); });
    $('#subtaskList').addEventListener('click', (e) => { const del = e.target.dataset.subdel; if (del) { editingSubs = editingSubs.filter((s) => s.id !== del); renderSubtaskEditor(); } });
    $('#subtaskList').addEventListener('change', (e) => { const sid = e.target.dataset.sid; if (sid) { const s = editingSubs.find((x) => x.id === sid); if (s) s.done = e.target.checked; } });

    // 批量
    $('#batchBtn').addEventListener('click', () => { document.body.classList.toggle('batch-mode'); $('#batchBar').hidden = !document.body.classList.contains('batch-mode'); if (!document.body.classList.contains('batch-mode')) $$('.batch-check').forEach((c) => (c.checked = false)); });
    $('#batchAll').addEventListener('change', (e) => { $$('.batch-check').forEach((c) => (c.checked = e.target.checked)); });
    $('#batchBar').addEventListener('click', (e) => {
      const act = e.target.dataset.batch; if (!act) return;
      if (act === 'exit') { document.body.classList.remove('batch-mode'); $('#batchBar').hidden = true; $$('.batch-check').forEach((c) => (c.checked = false)); return; }
      const ids = $$('.batch-check').filter((c) => c.checked).map((c) => c.dataset.batch); if (!ids.length) { toast('未选择'); return; }
      for (const id of ids) { const t = state.todos.find((x) => x.id === id); if (!t) continue; if (act === 'done') { t.isCompleted = true; t.completedAt = now(); } else if (act === 'archive') t.isArchived = true; else if (act === 'private') t.isPrivate = !t.isPrivate; else if (act === 'delete') { t.isDeleted = true; t.deletedAt = now(); } }
      saveState(); renderTodos(); toast('已' + ({ done: '完成', archive: '归档', private: '切换私密', delete: '删除' }[act]) + ' ' + ids.length + ' 项');
    });

    // 分类
    $('#catAdd').addEventListener('click', () => { const name = $('#catName').value.trim(); if (!name) { toast('请填分类名'); return; } state.categories.push(emptyCategory({ name, icon: $('#catIcon').value.trim() || 'folder', color: hexToColor($('#catColor').value) })); saveState(); renderCatList(); renderCategorySelects(); $('#catName').value = ''; toast('已添加分类'); });
    $('#catList').addEventListener('click', (e) => { const ed = e.target.dataset.catedit, dl = e.target.dataset.catdel; if (ed) { const c = state.categories.find((x) => x.id === ed); if (c) { $('#catName').value = c.name; $('#catIcon').value = c.icon; $('#catColor').value = colorToHex(c.color); state.categories = state.categories.filter((x) => x.id !== ed); saveState(); renderCatList(); renderCategorySelects(); } } else if (dl) { state.categories = state.categories.filter((x) => x.id !== dl); state.todos.forEach((t) => { if (t.categoryId === dl) t.categoryId = null; }); saveState(); renderCatList(); renderCategorySelects(); renderTodos(); toast('已删除分类'); } });
    $('#catClose').addEventListener('click', () => ($('#catModal').hidden = true));

    // 习惯
    $('#addHabitBtn').addEventListener('click', () => openHabitModal(null));
    $('#habitList').addEventListener('click', (e) => { const id = e.target.dataset.hcheck || e.target.dataset.hminus; if (id) { habitCheck(id, e.target.dataset.hcheck ? 1 : -1); return; } const ed = e.target.dataset.hedit, dl = e.target.dataset.hdel; if (ed) openHabitModal(state.habits.find((x) => x.id === ed)); else if (dl) { state.habits = state.habits.filter((x) => x.id !== dl); saveState(); renderHabits(); } });
    $('#habitSave').addEventListener('click', () => { const name = $('#hName').value.trim(); if (!name) { toast('请填名称'); return; } const data = { name, icon: $('#hIcon').value.trim() || '✅', period: parseInt($('#hPeriod').value, 10) || 1, target: parseInt($('#hTarget').value, 10) || 1 }; if (editingHabit) { const i = state.habits.findIndex((x) => x.id === editingHabit); if (i >= 0) state.habits[i] = Object.assign({}, state.habits[i], data); } else state.habits.push(emptyHabit(data)); saveState(); renderHabits(); $('#habitModal').hidden = true; });
    $('#habitCancel').addEventListener('click', () => ($('#habitModal').hidden = true));

    // 目标
    $('#addGoalBtn').addEventListener('click', () => openGoalModal(null));
    $('#goalList').addEventListener('click', (e) => { const id = e.target.dataset.gplus || e.target.dataset.gminus; if (id) { const g = state.goals.find((x) => x.id === id); if (g) { g.current = Math.max(0, g.current + (e.target.dataset.gplus ? 1 : -1)); saveState(); renderGoals(); } return; } const mc = e.target.dataset.mcheck; if (mc) { const g = state.goals.find((x) => x.id === mc); const i = parseInt(e.target.dataset.mi, 10); if (g && g.miles[i]) { g.miles[i].done = e.target.checked; saveState(); renderGoals(); } return; } const ed = e.target.dataset.gedit, dl = e.target.dataset.gdel; if (ed) openGoalModal(state.goals.find((x) => x.id === ed)); else if (dl) { state.goals = state.goals.filter((x) => x.id !== dl); saveState(); renderGoals(); } });
    $('#goalSave').addEventListener('click', () => { const title = $('#gTitle').value.trim(); if (!title) { toast('请填标题'); return; } const data = { title, target: parseInt($('#gTarget').value, 10) || 100, unit: $('#gUnit').value.trim(), miles: $('#gMiles').value.split('\n').map((s) => s.trim()).filter(Boolean).map((t) => ({ text: t, done: false })) }; if (editingGoal) { const i = state.goals.findIndex((x) => x.id === editingGoal); if (i >= 0) state.goals[i] = Object.assign({}, state.goals[i], data); } else state.goals.push(emptyGoal(data)); saveState(); renderGoals(); $('#goalModal').hidden = true; });
    $('#goalCancel').addEventListener('click', () => ($('#goalModal').hidden = true));

    // 模板
    $('#addTplBtn').addEventListener('click', () => openTplModal(null));
    $('#tplList').addEventListener('click', (e) => { const ap = e.target.dataset.tapply; if (ap) { applyTemplate(ap); return; } const dl = e.target.dataset.tdel; if (dl) { state.templates = state.templates.filter((x) => x.id !== dl); saveState(); renderTemplates(); return; } const ed = e.target.dataset.tedit; if (ed) openTplModal(state.templates.find((x) => x.id === ed)); });
    $('#tplSave').addEventListener('click', () => { const name = $('#tName').value.trim(); if (!name) { toast('请填名称'); return; } const data = { name, icon: $('#tIcon').value.trim() || '📋', title: $('#tTitle').value.trim() || name, priority: $('#tPriority').value, subs: $('#tSubs').value.split('\n').map((s) => s.trim()).filter(Boolean) }; if (editingTpl) { const i = state.templates.findIndex((x) => x.id === editingTpl); if (i >= 0) state.templates[i] = Object.assign({}, state.templates[i], data); } else state.templates.push(emptyTpl(data)); saveState(); renderTemplates(); $('#tplModal').hidden = true; });
    $('#tplCancel').addEventListener('click', () => ($('#tplModal').hidden = true));

    // 回顾
    $('#reviewRange').addEventListener('change', renderReview);
    $('#reviewTidy').addEventListener('click', reviewTidy);
    $('#reviewCopy').addEventListener('click', () => { const txt = $('#reviewOut').textContent; navigator.clipboard && navigator.clipboard.writeText(txt); toast('已复制复盘报告'); });

    // 设置：锁
    $('#lockEnabled').checked = !!state.settings.lockEnabled;
    $('#lockPass').value = state.settings.lockPass ? '••••' : '';
    $('#lockSave').addEventListener('click', applyLockSettings);
    $('#lockBtn').addEventListener('click', () => { sessionStorage.removeItem('lm_unlocked'); if (state.settings.lockEnabled) { $('#unlockModal').hidden = false; } else toast('应用锁未启用'); });
    $('#unlockBtn').addEventListener('click', tryUnlock);
    $('#unlockPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

    // 设置：GitHub
    const gh = readGhCfg(); $('#ghOwner').value = gh.owner; $('#ghRepo').value = gh.repo; $('#ghBranch').value = gh.branch; $('#ghToken').value = gh.token;
    $('#ghSave').addEventListener('click', () => { saveCfg(LS.gh, { owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim() || 'lightmark-data', branch: $('#ghBranch').value.trim() || 'main', token: $('#ghToken').value.trim() }); toast('已保存 GitHub 配置'); });
    $('#syncBtn').addEventListener('click', ghPush);
    $('#ghPull').addEventListener('click', ghPull); $('#ghPush').addEventListener('click', ghPush);

    // 设置：AI
    const ai = readAiCfg(); $('#aiBase').value = ai.base; $('#aiKey').value = ai.key; $('#aiModel').value = ai.model;
    $('#aiSave').addEventListener('click', () => { saveCfg(LS.ai, { base: $('#aiBase').value.trim(), key: $('#aiKey').value.trim(), model: $('#aiModel').value.trim() || 'gpt-3.5-turbo' }); toast('已保存 AI 配置'); });
    $('#aiReset').addEventListener('click', () => { $('#aiBase').value = ''; $('#aiKey').value = ''; saveCfg(LS.ai, { base: '', key: '', model: 'gpt-3.5-turbo' }); toast('已切回本机规则'); });
    $('#aiGen').addEventListener('click', aiGenerate); $('#aiPolish').addEventListener('click', aiPolish); $('#aiSum').addEventListener('click', aiSummarize); $('#aiApply').addEventListener('click', applyAiTodos); $('#chatSend').addEventListener('click', chatSend); $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') chatSend(); });

    // 数据
    $('#exportBtn').addEventListener('click', exportJson); $('#exportMd').addEventListener('click', exportMd); $('#exportCsv').addEventListener('click', exportCsv); $('#exportIcs').addEventListener('click', exportIcs);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    $('#retention').value = String(state.settings.retention != null ? state.settings.retention : 30);
    $('#retention').addEventListener('change', () => { state.settings.retention = parseInt($('#retention').value, 10); saveState(); });
    $('#clearBtn').addEventListener('click', () => { if (confirm('确定清空本机全部待办/分类/习惯/目标/模板？此操作不可撤销（GitHub 数据不受影响）。')) { state = { todos: [], categories: [], habits: [], goals: [], templates: [], settings: state.settings }; saveState(); renderAll(); toast('已清空本机'); } });

    // 显示
    $('#density').value = state.settings.density || 'comfortable';
    $('#density').addEventListener('change', () => { state.settings.density = $('#density').value; document.body.setAttribute('data-density', state.settings.density); saveState(); });
    $('#cheerOn').checked = !!state.settings.cheerOn;
    $('#cheerOn').addEventListener('change', () => { state.settings.cheerOn = $('#cheerOn').checked; saveState(); });

    // 主题
    $('#themeBtn').addEventListener('click', () => { const cur = document.body.getAttribute('data-theme'); applyTheme(cur === 'dark' ? 'light' : 'dark'); });

    // 番茄钟
    $('#pomoFab').addEventListener('click', () => { $('#pomoBox').hidden = !$('#pomoBox').hidden; });
    $('#pomoStart').addEventListener('click', pomoStart); $('#pomoReset').addEventListener('click', pomoReset);

    // 弹窗关闭
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m && m.id !== 'loginModal' && m.id !== 'unlockModal') m.hidden = true; }));

    // 登录
    const closeLogin = () => { sessionStorage.setItem('lm_login_done', '1'); $('#loginModal').hidden = true; };
    $('#loginEnter').addEventListener('click', () => { const n = $('#loginName').value.trim(); if (n) { state.settings.name = n; saveState(); } closeLogin(); });
    $('#loginSkip').addEventListener('click', closeLogin);
  }

  /* ============ 20. 启动 ============ */
  function init() {
    applyTheme(localStorage.getItem(LS.theme) || 'light');
    document.body.setAttribute('data-density', state.settings.density || 'comfortable');
    loadState();
    bind();
    renderAll();
    maybeLock();
    if (!sessionStorage.getItem('lm_login_done')) $('#loginModal').hidden = false;
  }
  document.addEventListener('DOMContentLoaded', init);
})();
