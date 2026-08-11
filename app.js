/* 轻刻网页版 LightMark Web — 纯前端、无后端、无构建
 * 数据契约与 Android App 的 SyncData / TodoItem / Category 完全一致。
 */
(function () {
  'use strict';

  /* ============ 1. 数据契约（与 App 一致） ============ */
  const SYNC_VERSION = 1;
  const DATA_FILE = 'lightmark-data.json';
  const PRIORITIES = ['IDLE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED'];
  const PRIO_LABEL = { IDLE: '空闲', LOW: '低', MEDIUM: '中', HIGH: '高', URGENT: '紧急' };
  const STATUS_LABEL = { ACTIVE: '进行中', PAUSED: '暂停', CANCELLED: '已取消' };

  const now = () => Date.now();
  const genId = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  function colorToHex(n) {
    if (typeof n !== 'number' || isNaN(n)) n = 0xff6200ee;
    return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
  }
  function hexToColor(hex) {
    const h = (hex || '#6200ee').replace('#', '');
    return parseInt('ff' + h, 16);
  }

  function emptyTodo(o = {}) {
    return Object.assign({
      id: genId('todo'), title: '', description: '', isCompleted: false,
      priority: 'MEDIUM', categoryId: null, tags: [], dueDate: null, startDate: null,
      isPinned: false, isBlocked: false, status: 'ACTIVE', isArchived: false,
      isDeleted: false, deletedAt: null, parentId: null, recurrenceRule: null,
      createdAt: now(), updatedAt: now(), completedAt: null,
    }, o);
  }
  function emptyCategory(o = {}) {
    return Object.assign({
      id: genId('cat'), name: '', color: 0xff6200ee, icon: 'folder', createdAt: now(),
    }, o);
  }

  function normalizeTodo(r) {
    if (!r || typeof r !== 'object') return null;
    const t = emptyTodo();
    const out = Object.assign(t, r);
    out.id = String(r.id != null ? r.id : t.id);
    out.title = String(r.title != null ? r.title : '');
    out.priority = PRIORITIES.includes(r.priority) ? r.priority : 'MEDIUM';
    out.status = STATUSES.includes(r.status) ? r.status : 'ACTIVE';
    out.tags = Array.isArray(r.tags) ? r.tags.map(String) : [];
    out.isCompleted = !!r.isCompleted;
    out.isPinned = !!r.isPinned;
    out.isArchived = !!r.isArchived;
    out.isDeleted = !!r.isDeleted;
    out.categoryId = r.categoryId != null ? String(r.categoryId) : null;
    for (const k of ['dueDate', 'startDate', 'deletedAt', 'completedAt', 'createdAt', 'updatedAt', 'parentId'])
      out[k] = r[k] != null ? r[k] : t[k];
    return out;
  }
  function normalizeCategory(r) {
    if (!r || typeof r !== 'object') return null;
    const c = emptyCategory();
    const out = Object.assign(c, r);
    out.id = String(r.id != null ? r.id : c.id);
    out.name = String(r.name != null ? r.name : '');
    if (typeof r.color === 'string' && r.color.startsWith('#')) out.color = hexToColor(r.color);
    else if (typeof r.color === 'number') out.color = r.color;
    return out;
  }

  function toSyncData(st) {
    return {
      version: SYNC_VERSION,
      lastSync: now(),
      todos: st.todos.map((t) => Object.assign({}, t)),
      categories: st.categories.map((c) => Object.assign({}, c)),
    };
  }
  function fromSyncData(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('文件格式不正确');
    const todos = Array.isArray(obj.todos) ? obj.todos.map(normalizeTodo).filter(Boolean) : [];
    const categories = Array.isArray(obj.categories) ? obj.categories.map(normalizeCategory).filter(Boolean) : [];
    return { todos, categories };
  }

  /* ============ 2. 本地存储 ============ */
  const LS = {
    state: 'lm_web_state_v1',
    gh: 'lm_web_gh_v1',
    ai: 'lm_web_ai_v1',
    theme: 'lm_web_theme',
  };
  let state = { todos: [], categories: [] };

  function loadState() {
    try {
      const raw = localStorage.getItem(LS.state);
      if (raw) {
        const o = JSON.parse(raw);
        state.todos = (o.todos || []).map(normalizeTodo).filter(Boolean);
        state.categories = (o.categories || []).map(normalizeCategory).filter(Boolean);
      }
    } catch (e) { console.warn('loadState', e); }
  }
  function saveState() {
    localStorage.setItem(LS.state, JSON.stringify(state));
  }
  function loadCfg(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function saveCfg(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

  /* ============ 3. 工具 ============ */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 2400);
  }
  function tsToDateInput(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return new Date(ts - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(b64))); }

  /* ============ 4. 渲染：待办列表 ============ */
  function getFilters() {
    return {
      q: $('#searchInput').value.trim().toLowerCase(),
      priority: $('#filterPriority').value,
      status: $('#filterStatus').value,
      category: $('#filterCategory').value,
    };
  }
  function catById(id) { return state.categories.find((c) => c.id === id) || null; }

  function renderStats() {
    const t = state.todos.filter((x) => !x.isDeleted);
    const active = t.filter((x) => !x.isCompleted && x.status === 'ACTIVE' && !x.isArchived).length;
    const done = t.filter((x) => x.isCompleted).length;
    const archived = t.filter((x) => x.isArchived).length;
    $('#statsBar').innerHTML =
      `<span>总：${t.length}</span><span>进行中：${active}</span><span>已完成：${done}</span><span>归档：${archived}</span>`;
  }

  function renderCategorySelects() {
    const opts = state.categories.map((c) => `<option value="${c.id}">${c.name || '(未命名)'}</option>`).join('');
    $('#filterCategory').innerHTML = '<option value="">全部分类</option>' + opts;
    $('#fCategory').innerHTML = '<option value="">（无）</option>' + opts;
  }

  function renderTodos() {
    const f = getFilters();
    let list = state.todos.filter((x) => !x.isDeleted);
    if (f.q) list = list.filter((x) =>
      (x.title || '').toLowerCase().includes(f.q) ||
      (x.description || '').toLowerCase().includes(f.q) ||
      (x.tags || []).some((tg) => tg.toLowerCase().includes(f.q)));
    if (f.priority) list = list.filter((x) => x.priority === f.priority);
    if (f.status === 'ARCHIVED') list = list.filter((x) => x.isArchived);
    else if (f.status) list = list.filter((x) => x.status === f.status && !x.isArchived);
    if (f.category) list = list.filter((x) => x.categoryId === f.category);

    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const pa = PRIORITIES.indexOf(a.priority), pb = PRIORITIES.indexOf(b.priority);
      if (pa !== pb) return pb - pa;
      return b.updatedAt - a.updatedAt;
    });

    const ul = $('#todoList');
    ul.innerHTML = '';
    $('#emptyHint').hidden = list.length > 0;
    for (const t of list) {
      const c = catById(t.categoryId);
      const li = document.createElement('li');
      li.className = 'todo-item' + (t.isCompleted ? ' done' : '') + (t.isPinned ? ' pinned' : '');
      const tags = (t.tags || []).map((tg) => `<span class="tag">${esc(tg)}</span>`).join('');
      const meta = [];
      meta.push(`<span class="pill prio-${t.priority}">${PRIO_LABEL[t.priority]}</span>`);
      if (t.status !== 'ACTIVE') meta.push(`<span class="pill">${STATUS_LABEL[t.status]}</span>`);
      if (c) meta.push(`<span><span class="cat-dot" style="background:${colorToHex(c.color)}"></span>${esc(c.name)}</span>`);
      if (t.dueDate) meta.push(`<span>截止 ${fmtDate(t.dueDate)}</span>`);
      if (t.recurrenceRule && t.recurrenceRule !== 'NONE') meta.push(`<span>🔁 ${recLabel(t.recurrenceRule)}</span>`);
      li.innerHTML = `
        <input type="checkbox" class="todo-check" ${t.isCompleted ? 'checked' : ''} data-id="${t.id}" />
        <div class="todo-main">
          <div class="todo-title">${esc(t.title || '(无标题)')}${t.isPinned ? '<span class="pin">📌</span>' : ''}</div>
          <div class="todo-meta">${meta.join('')}${tags}</div>
        </div>
        <div class="todo-actions">
          <button class="icon-mini" data-edit="${t.id}" title="编辑">✏️</button>
          <button class="icon-mini" data-del="${t.id}" title="删除">🗑️</button>
        </div>`;
      ul.appendChild(li);
    }
    renderStats();
  }
  function recLabel(r) {
    if (!r || r === 'NONE') return '不重复';
    if (r === 'DAILY') return '每天';
    if (r === 'WEEKLY') return '每周';
    if (r === 'MONTHLY') return '每月';
    if (r.startsWith('INTERVAL:')) return '每 ' + r.split(':')[1] + ' 天';
    return '自定义';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  /* ============ 5. 待办编辑弹窗 ============ */
  let editingId = null;
  function openTodoModal(t) {
    editingId = t ? t.id : null;
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
    $('#fArchived').checked = t ? !!t.isArchived : false;
    $('#todoModal').hidden = false;
  }
  function closeTodoModal() { $('#todoModal').hidden = true; editingId = null; }

  function saveTodo() {
    const title = $('#fTitle').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const data = {
      title,
      description: $('#fDesc').value.trim(),
      priority: $('#fPriority').value,
      status: $('#fStatus').value,
      categoryId: $('#fCategory').value || null,
      dueDate: $('#fDue').value ? new Date($('#fDue').value + 'T00:00:00').getTime() : null,
      startDate: $('#fStart').value ? new Date($('#fStart').value + 'T00:00:00').getTime() : null,
      recurrenceRule: $('#fRecur').value === 'NONE' ? null : $('#fRecur').value,
      tags: $('#fTags').value.split(',').map((s) => s.trim()).filter(Boolean),
      isPinned: $('#fPinned').checked,
      isArchived: $('#fArchived').checked,
      updatedAt: now(),
    };
    if (editingId) {
      const i = state.todos.findIndex((t) => t.id === editingId);
      if (i >= 0) state.todos[i] = Object.assign({}, state.todos[i], data);
    } else {
      state.todos.push(emptyTodo(data));
    }
    saveState(); renderTodos(); closeTodoModal(); toast('已保存');
  }

  function deleteTodo(id) {
    const i = state.todos.findIndex((t) => t.id === id);
    if (i >= 0) {
      state.todos[i] = Object.assign({}, state.todos[i], { isDeleted: true, deletedAt: now(), updatedAt: now() });
      saveState(); renderTodos(); toast('已移入回收站');
    }
  }
  function toggleDone(id, val) {
    const t = state.todos.find((x) => x.id === id);
    if (t) {
      t.isCompleted = val;
      t.completedAt = val ? now() : null;
      t.updatedAt = now();
      saveState(); renderTodos();
    }
  }

  /* ============ 6. 分类管理 ============ */
  function renderCatList() {
    const ul = $('#catList');
    ul.innerHTML = '';
    for (const c of state.categories) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="cat-dot" style="background:${colorToHex(c.color)}"></span>
        <span class="grow">${esc(c.name || '(未命名)')} <span class="muted">· ${esc(c.icon)}</span></span>
        <button class="icon-mini" data-catedit="${c.id}">✏️</button>
        <button class="icon-mini" data-catdel="${c.id}">🗑️</button>`;
      ul.appendChild(li);
    }
  }
  function openCatModal() { renderCatList(); $('#catModal').hidden = false; }

  /* ============ 7. GitHub 同步 ============ */
  async function ghRequest(path, { method = 'GET', token, body } = {}) {
    const res = await fetch('https://api.github.com' + path, {
      method,
      headers: Object.assign(
        { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
        body ? { 'Content-Type': 'application/json' } : {}
      ),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }
  async function ghRead(cfg) {
    const q = cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '';
    const data = await ghRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_FILE}${q}`, { token: cfg.token });
    return { data: JSON.parse(b64decode(data.content)), sha: data.sha };
  }
  async function ghWrite(cfg, content, sha) {
    const body = { message: 'lightmark: sync ' + new Date().toISOString(), content: b64encode(content) };
    if (sha) body.sha = sha;
    if (cfg.branch) body.branch = cfg.branch;
    return ghRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_FILE}`, { method: 'PUT', token: cfg.token, body });
  }
  function readGhCfg() {
    const c = loadCfg(LS.gh);
    return { owner: c.owner || '', repo: c.repo || 'lightmark-data', branch: c.branch || 'main', token: c.token || '' };
  }
  async function ghPull() {
    const cfg = readGhCfg();
    if (!cfg.owner || !cfg.repo || !cfg.token) { toast('请先填写并保存 GitHub 配置'); return; }
    setGhStatus('拉取中…');
    try {
      const { data } = await ghRead(cfg);
      const incoming = fromSyncData(data);
      mergeFrom(incoming);
      saveState(); renderTodos(); renderCategorySelects();
      setGhStatus('✅ 已拉取 ' + incoming.todos.length + ' 条待办');
      toast('已从 GitHub 拉取');
    } catch (e) { setGhStatus('❌ ' + e.message); toast('拉取失败：' + e.message); }
  }
  async function ghPush() {
    const cfg = readGhCfg();
    if (!cfg.owner || !cfg.repo || !cfg.token) { toast('请先填写并保存 GitHub 配置'); return; }
    setGhStatus('推送中…');
    try {
      let sha = null;
      try { const r = await ghRead(cfg); sha = r.sha; } catch (e) { /* 文件不存在则新建 */ }
      const payload = JSON.stringify(toSyncData(state), null, 2);
      await ghWrite(cfg, payload, sha);
      setGhStatus('✅ 已推送 ' + state.todos.length + ' 条待办');
      toast('已推送到 GitHub');
    } catch (e) { setGhStatus('❌ ' + e.message); toast('推送失败：' + e.message); }
  }
  function setGhStatus(s) { $('#ghStatus').textContent = s; }

  function mergeFrom(incoming) {
    const merge = (local, inc) => {
      const map = new Map(local.map((x) => [x.id, x]));
      for (const it of inc) {
        const ex = map.get(it.id);
        if (!ex) map.set(it.id, it);
        else if ((it.updatedAt || 0) >= (ex.updatedAt || 0)) map.set(it.id, it);
      }
      return Array.from(map.values());
    };
    state.todos = merge(state.todos, incoming.todos);
    state.categories = merge(state.categories, incoming.categories);
  }

  /* ============ 8. 导入 / 导出 ============ */
  function exportJson() {
    const payload = JSON.stringify(toSyncData(state), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = DATA_FILE; a.click();
    URL.revokeObjectURL(url);
    toast('已导出 ' + DATA_FILE);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = fromSyncData(JSON.parse(reader.result));
        mergeFrom(incoming);
        saveState(); renderTodos(); renderCategorySelects();
        toast(`已导入 ${incoming.todos.length} 条待办 / ${incoming.categories.length} 个分类`);
      } catch (e) { toast('导入失败：' + e.message); }
    };
    reader.readAsText(file);
  }

  /* ============ 9. AI（OpenAI 兼容 + 本地规则兜底） ============ */
  function readAiCfg() {
    const c = loadCfg(LS.ai);
    return { base: c.base || '', key: c.key || '', model: c.model || 'gpt-3.5-turbo' };
  }
  async function aiChat(messages, cfg) {
    if (!cfg || !cfg.base || !cfg.key) return localChat(messages);
    const res = await fetch(cfg.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model || 'gpt-3.5-turbo', messages, temperature: 0.7 }),
    });
    if (!res.ok) {
      let m = `${res.status}`;
      try { const j = await res.json(); m = (j && j.error && j.error.message) || m; } catch (e) {}
      throw new Error(m);
    }
    const j = await res.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
  }

  // 本地规则兜底
  function localChat(messages) {
    const last = messages.filter((m) => m.role === 'user').pop();
    const text = (last && last.content) || '';
    return '（本机规则模式）我已离线，仅做基础处理。你可以：\n' +
      '• 在「AI 快捷操作」里粘贴一段话，点「生成待办」拆成任务；\n' +
      '• 或填写 OpenAI 兼容的 Base URL 与 Key 启用联网 AI。\n\n' +
      '你刚才说：' + text.slice(0, 120);
  }
  function localGenerate(text) {
    const lines = text.split(/\n+/).map((s) => s.replace(/^[\s\d.\-、)*]+\s*/, '').trim()).filter(Boolean);
    return lines.map((t) => emptyTodo({ title: t.slice(0, 80) }));
  }
  function localPolish(text) {
    return text.replace(/\s+/g, ' ').replace(/[，,]+/g, '，').replace(/\s*([。！？])/g, '$1').trim();
  }
  function localSummarize(text) {
    const sents = text.split(/[。！？\n]+/).map((s) => s.trim()).filter(Boolean);
    const top = sents.slice(0, 5);
    return top.length ? top.map((s, i) => `${i + 1}. ${s}`).join('\n') : '（内容过短，无可总结）';
  }

  let pendingTodos = [];
  function showAiResult(text, asTodos) {
    const el = $('#aiResult'); el.hidden = false; el.textContent = text;
    pendingTodos = asTodos || [];
    $('#aiApply').hidden = !(asTodos && asTodos.length);
  }
  function extractJsonArray(s) {
    try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch (e) {}
    const i = s.indexOf('['), j = s.lastIndexOf(']');
    if (i >= 0 && j > i) { try { const a = JSON.parse(s.slice(i, j + 1)); if (Array.isArray(a)) return a; } catch (e) {} }
    return null;
  }
  async function aiGenerate() {
    const text = $('#aiInput').value.trim();
    if (!text) { toast('请先输入内容'); return; }
    const cfg = readAiCfg();
    try {
      if (cfg.base && cfg.key) {
        const sys = '你是任务拆解助手。把用户的文字整理成待办清单，只输出 JSON 数组，元素形如 {"title":"...","priority":"MEDIUM|HIGH|LOW|URGENT|IDLE","tags":["..."]}。不要多余解释。';
        const out = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: text }], cfg);
        const arr = extractJsonArray(out);
        if (arr) {
          const todos = arr.map((x) => emptyTodo({
            title: String(x.title || '').slice(0, 80),
            priority: PRIORITIES.includes(x.priority) ? x.priority : 'MEDIUM',
            tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
            description: x.description ? String(x.description) : '',
          }));
          showAiResult(todos.map((t) => '• ' + t.title).join('\n'), todos);
          toast('AI 生成 ' + todos.length + ' 条，点「应用」加入');
          return;
        }
        showAiResult(out, localGenerate(text));
        return;
      }
      const todos = localGenerate(text);
      showAiResult(todos.map((t) => '• ' + t.title).join('\n'), todos);
      toast('本机生成 ' + todos.length + ' 条，点「应用」加入');
    } catch (e) { showAiResult('生成失败：' + e.message, null); toast('生成失败：' + e.message); }
  }
  async function aiPolish() {
    const text = $('#aiInput').value.trim();
    if (!text) { toast('请先输入内容'); return; }
    const cfg = readAiCfg();
    try {
      if (cfg.base && cfg.key) {
        const out = await aiChat([{ role: 'system', content: '你是文本润色助手，只返回润色后的文本。' }, { role: 'user', content: text }], cfg);
        showAiResult(out, null);
      } else showAiResult(localPolish(text), null);
    } catch (e) { showAiResult('润色失败：' + e.message, null); }
  }
  async function aiSummarize() {
    const text = $('#aiInput').value.trim();
    if (!text) { toast('请先输入内容'); return; }
    const cfg = readAiCfg();
    try {
      if (cfg.base && cfg.key) {
        const out = await aiChat([{ role: 'system', content: '你是总结助手，用带编号的要点总结用户文字。' }, { role: 'user', content: text }], cfg);
        showAiResult(out, null);
      } else showAiResult(localSummarize(text), null);
    } catch (e) { showAiResult('总结失败：' + e.message, null); }
  }
  function applyAiTodos() {
    if (!pendingTodos.length) return;
    state.todos.push(...pendingTodos);
    saveState(); renderTodos();
    toast('已加入 ' + pendingTodos.length + ' 条待办');
    pendingTodos = []; $('#aiApply').hidden = true; $('#aiResult').hidden = true;
  }

  // 聊天
  let chatMsgs = [];
  function renderChat() {
    const log = $('#chatLog');
    log.innerHTML = '';
    for (const m of chatMsgs) {
      const b = document.createElement('div');
      b.className = 'bubble ' + (m.role === 'user' ? 'user' : 'ai');
      b.textContent = m.content;
      log.appendChild(b);
    }
    log.scrollTop = log.scrollHeight;
  }
  async function chatSend() {
    const v = $('#chatInput').value.trim();
    if (!v) return;
    chatMsgs.push({ role: 'user', content: v });
    $('#chatInput').value = '';
    renderChat();
    const cfg = readAiCfg();
    try {
      const out = await aiChat(chatMsgs.slice(), cfg);
      chatMsgs.push({ role: 'assistant', content: out });
    } catch (e) {
      chatMsgs.push({ role: 'assistant', content: '出错了：' + e.message });
    }
    renderChat();
  }

  /* ============ 10. 主题 ============ */
  function applyTheme(t) {
    document.body.setAttribute('data-theme', t);
    localStorage.setItem(LS.theme, t);
  }

  /* ============ 11. 事件绑定 + 启动 ============ */
  function bind() {
    // tabs
    $$('.tab').forEach((b) => b.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.remove('active'));
      $$('.panel').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      $('#panel-' + b.dataset.tab).classList.add('active');
    }));

    // 待办
    $('#searchInput').addEventListener('input', renderTodos);
    $('#filterPriority').addEventListener('change', renderTodos);
    $('#filterStatus').addEventListener('change', renderTodos);
    $('#filterCategory').addEventListener('change', renderTodos);
    $('#addTodoBtn').addEventListener('click', () => openTodoModal(null));
    $('#manageCatBtn').addEventListener('click', openCatModal);
    $('#todoList').addEventListener('click', (e) => {
      const edit = e.target.dataset.edit, del = e.target.dataset.del;
      if (edit) { const t = state.todos.find((x) => x.id === edit); if (t) openTodoModal(t); }
      else if (del) deleteTodo(del);
    });
    $('#todoList').addEventListener('change', (e) => {
      if (e.target.classList.contains('todo-check')) toggleDone(e.target.dataset.id, e.target.checked);
    });
    $('#todoSave').addEventListener('click', saveTodo);
    $('#todoCancel').addEventListener('click', closeTodoModal);

    // 分类
    $('#catAdd').addEventListener('click', () => {
      const name = $('#catName').value.trim();
      if (!name) { toast('请填分类名'); return; }
      state.categories.push(emptyCategory({ name, icon: $('#catIcon').value.trim() || 'folder', color: hexToColor($('#catColor').value) }));
      saveState(); renderCatList(); renderCategorySelects();
      $('#catName').value = ''; toast('已添加分类');
    });
    $('#catList').addEventListener('click', (e) => {
      const ed = e.target.dataset.catedit, dl = e.target.dataset.catdel;
      if (ed) {
        const c = state.categories.find((x) => x.id === ed);
        if (c) { $('#catName').value = c.name; $('#catIcon').value = c.icon; $('#catColor').value = colorToHex(c.color); state.categories = state.categories.filter((x) => x.id !== ed); saveState(); renderCatList(); renderCategorySelects(); }
      } else if (dl) {
        state.categories = state.categories.filter((x) => x.id !== dl);
        state.todos.forEach((t) => { if (t.categoryId === dl) t.categoryId = null; });
        saveState(); renderCatList(); renderCategorySelects(); renderTodos(); toast('已删除分类');
      }
    });
    $('#catClose').addEventListener('click', () => ($('#catModal').hidden = true));

    // 同步
    const gh = readGhCfg();
    $('#ghOwner').value = gh.owner; $('#ghRepo').value = gh.repo; $('#ghBranch').value = gh.branch; $('#ghToken').value = gh.token;
    $('#ghSave').addEventListener('click', () => {
      saveCfg(LS.gh, { owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim() || 'lightmark-data', branch: $('#ghBranch').value.trim() || 'main', token: $('#ghToken').value.trim() });
      toast('已保存 GitHub 配置');
    });
    $('#ghPull').addEventListener('click', ghPull);
    $('#ghPush').addEventListener('click', ghPush);
    $('#exportBtn').addEventListener('click', exportJson);
    $('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    $('#clearBtn').addEventListener('click', () => {
      if (confirm('确定清空本地全部待办与分类？此操作不可撤销（GitHub 上的数据不受影响）。')) {
        state = { todos: [], categories: [] }; saveState(); renderTodos(); renderCategorySelects(); toast('已清空本地');
      }
    });

    // AI
    const ai = readAiCfg();
    $('#aiBase').value = ai.base; $('#aiKey').value = ai.key; $('#aiModel').value = ai.model;
    $('#aiSave').addEventListener('click', () => {
      saveCfg(LS.ai, { base: $('#aiBase').value.trim(), key: $('#aiKey').value.trim(), model: $('#aiModel').value.trim() || 'gpt-3.5-turbo' });
      toast('已保存 AI 配置');
    });
    $('#aiReset').addEventListener('click', () => { $('#aiBase').value = ''; $('#aiKey').value = ''; saveCfg(LS.ai, { base: '', key: '', model: 'gpt-3.5-turbo' }); toast('已切回本机规则'); });
    $('#aiGen').addEventListener('click', aiGenerate);
    $('#aiPolish').addEventListener('click', aiPolish);
    $('#aiSum').addEventListener('click', aiSummarize);
    $('#aiApply').addEventListener('click', applyAiTodos);
    $('#chatSend').addEventListener('click', chatSend);
    $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') chatSend(); });

    // 主题
    $('#themeBtn').addEventListener('click', () => {
      const cur = document.body.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // 点遮罩关闭弹窗
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));
  }

  function init() {
    applyTheme(localStorage.getItem(LS.theme) || 'light');
    loadState();
    renderCategorySelects();
    renderTodos();
    bind();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
