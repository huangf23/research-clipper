// sidepanel.js - 简化版，专注于关键词和笔记管理
// 核心功能：
// 1. 笔记列表显示（按时间倒序）
// 2. 关键词管理（添加、删除、编辑）
// 3. 关键词筛选
// 4. 笔记导出

// ===== 全局状态 =====
let selectedKeywords = []; // 当前选中的关键词用于筛选
let searchQuery = ''; // 当前搜索词

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  console.log("[SidePanel] 页面加载完成");
  
  // 绑定导出按钮
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportAsJSON);
  
  const exportBibBtn = document.getElementById('exportBibBtn');
  if (exportBibBtn) exportBibBtn.addEventListener('click', exportAsBibTeX);
  
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearAllNotes);
  
  // 绑定导入按钮与文件输入
  const importBtn = document.getElementById('importBtn');
  const importFileInput = document.getElementById('importFileInput');
  if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleImportFile);
  }
  
  // 初始化关键词和笔记
  initializeUI();
  renderKeywords();
  renderNotes();
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    console.log("[SidePanel] 存储已更改");
    renderKeywords();
    renderNotes();
  }
});

/**
 * 初始化 UI
 */
function initializeUI() {
  // 初始化模态框事件
  const keywordModal = document.getElementById('keywordModal');
  if (keywordModal) {
    keywordModal.addEventListener('click', (e) => {
      if (e.target === keywordModal) {
        closeKeywordModal();
      }
    });
  }
  
  // 绑定"添加关键词"按钮
  const addKeywordBtn = document.getElementById('addKeywordBtn');
  if (addKeywordBtn) {
    addKeywordBtn.addEventListener('click', addKeyword);
  }
  
  // 绑定输入框回车事件
  const keywordInput = document.getElementById('newKeywordInput');
  if (keywordInput) {
    keywordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addKeyword();
      }
    });
  }

  // 绑定搜索输入
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target.value || '').trim();
      renderNotes();
    });
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      const si = document.getElementById('searchInput');
      if (si) si.value = '';
      searchQuery = '';
      renderNotes();
    });
  }
}

/**
 * 渲染关键词导航栏
 */
function renderKeywords() {
  chrome.storage.local.get(['keywords'], (result) => {
    const keywords = result.keywords || [];
    const nav = document.getElementById('keywordsNav');
    
    if (!nav) return;
    
    nav.innerHTML = '';
    
    // "全部"按钮
    const allBtn = document.createElement('div');
    allBtn.className = 'keyword-tag' + (selectedKeywords.length === 0 ? ' active' : '');
    allBtn.textContent = '全部';
    allBtn.addEventListener('click', () => {
      selectedKeywords = [];
      renderKeywords();
      renderNotes();
    });
    nav.appendChild(allBtn);
    
    // 关键词按钮
    keywords.forEach((kw, idx) => {
      const btn = document.createElement('div');
      btn.className = 'keyword-tag' + (selectedKeywords.includes(kw) ? ' active' : '');
      btn.textContent = kw;
      btn.addEventListener('click', () => {
        const i = selectedKeywords.indexOf(kw);
        if (i > -1) {
          selectedKeywords.splice(i, 1);
        } else {
          selectedKeywords.push(kw);
        }
        renderKeywords();
        renderNotes();
      });
      nav.appendChild(btn);
    });
    
    // 管理按钮
    const manageBtn = document.createElement('button');
    manageBtn.className = 'keyword-manage-btn';
    manageBtn.textContent = '⚙️ 管理';
    manageBtn.addEventListener('click', openKeywordModal);
    nav.appendChild(manageBtn);
  });
}

/**
 * 打开关键词管理模态框
 */
function openKeywordModal() {
  const modal = document.getElementById('keywordModal');
  if (modal) {
    modal.classList.add('active');
    refreshKeywordList();
  }
}

/**
 * 关闭关键词管理模态框
 */
function closeKeywordModal() {
  const modal = document.getElementById('keywordModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * 刷新关键词管理列表
 */
function refreshKeywordList() {
  chrome.storage.local.get(['keywords', 'notes_v2'], (result) => {
    const keywords = result.keywords || [];
    const notes = result.notes_v2 || [];
    
    const list = document.getElementById('keywordList');
    if (!list) return;
    
    list.innerHTML = '';
    
    // 统计每个关键词的使用次数
    const counts = {};
    notes.forEach(note => {
      const noteKeywords = note.keywords || [];
      noteKeywords.forEach(kw => {
        counts[kw] = (counts[kw] || 0) + 1;
      });
    });
    
    keywords.forEach((kw, idx) => {
      const li = document.createElement('li');
      li.className = 'keyword-item';
      li.innerHTML = `
        <span class="keyword-item-text">${escapeHtml(kw)}</span>
        <span class="keyword-item-count">${counts[kw] || 0} 条</span>
        <button class="btn-delete-keyword" type="button" data-index="${idx}">删除</button>
      `;
      
      // 绑定删除按钮
      const deleteBtn = li.querySelector('.btn-delete-keyword');
      deleteBtn.addEventListener('click', () => {
        deleteKeyword(idx);
      });
      
      list.appendChild(li);
    });
  });
}

/**
 * 添加关键词
 */
function addKeyword() {
  const input = document.getElementById('newKeywordInput');
  if (!input) {
    console.error("[SidePanel] 找不到输入框");
    return;
  }
  
  const keyword = input.value.trim();
  
  if (!keyword) {
    alert('请输入关键词');
    return;
  }
  
  if (keyword.length > 30) {
    alert('关键词不能超过 30 个字');
    return;
  }
  
  chrome.storage.local.get(['keywords'], (result) => {
    let keywords = result.keywords || [];
    
    if (keywords.includes(keyword)) {
      alert('关键词已存在');
      return;
    }
    
    keywords.push(keyword);
    
    chrome.storage.local.set({ keywords }, () => {
      console.log("[SidePanel] 关键词已添加");
      input.value = '';
      refreshKeywordList();
      renderKeywords();
      alert('关键词添加成功');
    });
  });
}

/**
 * 删除关键词
 */
function deleteKeyword(index) {
  if (!confirm('确定删除此关键词吗？')) {
    return;
  }
  
  chrome.storage.local.get(['keywords', 'notes_v2'], (result) => {
    let keywords = result.keywords || [];
    let notes = result.notes_v2 || [];
    
    if (index < 0 || index >= keywords.length) {
      console.error("[SidePanel] 无效的关键词索引");
      return;
    }
    
    const deletedKeyword = keywords[index];
    keywords.splice(index, 1);
    
    // 从所有笔记中移除该关键词
    notes.forEach(note => {
      if (note.keywords) {
        note.keywords = note.keywords.filter(kw => kw !== deletedKeyword);
      }
    });
    
    chrome.storage.local.set({ keywords, notes_v2: notes }, () => {
      console.log("[SidePanel] 关键词已删除");
      refreshKeywordList();
      renderKeywords();
      renderNotes();
    });
  });
}

/**
 * 渲染笔记列表（按文献分组）
 */
function renderNotes() {
  chrome.storage.local.get(['notes_v2', 'keywords'], (result) => {
    let notes = result.notes_v2 || [];
    const keywords = result.keywords || [];
    const container = document.getElementById('list');
    const empty = document.getElementById('empty');
    
    if (!container) return;
    
    // 按关键词筛选
    if (selectedKeywords.length > 0) {
      notes = notes.filter(note => {
        const noteKeywords = note.keywords || [];
        return selectedKeywords.some(kw => noteKeywords.includes(kw));
      });
    }

      // 按搜索词过滤（支持文本、注释、元信息、关键词）
      if (searchQuery && searchQuery.length > 0) {
        const q = searchQuery.toLowerCase();
        notes = notes.filter(note => {
          const meta = note.meta || {};

          // 检查摘录文字
          if ((note.text || '').toLowerCase().includes(q)) return true;

          // 检查评论
          if ((note.comment || '').toLowerCase().includes(q)) return true;

          // 检查 meta 字段：title, author, journal, doi, abstract, url
          const fields = ['title','author','journal','doi','abstract','url'];
          for (let f of fields) {
            if (meta[f] && String(meta[f]).toLowerCase().includes(q)) return true;
          }

          // 检查关键词
          if (Array.isArray(note.keywords) && note.keywords.join(' ').toLowerCase().includes(q)) return true;

          return false;
        });
      }
    
    container.innerHTML = '';
    
    if (notes.length === 0) {
      if (empty) empty.style.display = 'block';
      // 更新搜索计数
      updateSearchCount(0);
      return;
    }
    
    if (empty) empty.style.display = 'none';
    
    // 按文献（DOI 或 URL）分组
    const grouped = groupNotesBySource(notes);
    
    // 按最新笔记时间排序每个分组
    const sortedGroups = Object.values(grouped).sort((a, b) => {
      const maxTimeA = Math.max(...a.map(n => n.timestamp || 0));
      const maxTimeB = Math.max(...b.map(n => n.timestamp || 0));
      return maxTimeB - maxTimeA;
    });
    
    // 渲染每个分组
    sortedGroups.forEach(group => {
      const groupContainer = createGroupContainer(group, keywords);
      container.appendChild(groupContainer);
    });

    // 更新搜索计数（显示匹配到的笔记总数）
    const totalMatched = notes.length;
    updateSearchCount(totalMatched);
  });
}

/**
 * 更新搜索计数显示
 */
function updateSearchCount(count) {
  const el = document.getElementById('searchCount');
  if (!el) return;
  if (searchQuery && searchQuery.length > 0) {
    el.textContent = `匹配 ${count} 条`;
  } else {
    el.textContent = '';
  }
}

/**
 * 按源文献（DOI 或 URL）分组笔记
 */
function groupNotesBySource(notes) {
  const groups = {};
  
  notes.forEach(note => {
    const meta = note.meta || {};
    // 优先使用 DOI，其次使用 URL，再次使用标题
    const key = meta.doi || meta.url || meta.title || 'unknown';
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(note);
  });
  
  // 每个分组内按时间倒序排序
  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  });
  
  return groups;
}

/**
 * 从一组笔记中选择最完整的 meta（避免新笔记覆盖已有完整信息）
 */
function selectBestMeta(notes) {
  const weightFields = ['title', 'author', 'journal', 'year', 'doi'];

  let best = null;
  let bestScore = -1;
  notes.forEach(note => {
    const meta = note.meta || {};
    let score = 0;
    weightFields.forEach(f => {
      if (meta[f]) score += 1;
    });
    // 更长的 title 或 author 也略微加分
    if (meta.title && meta.title.length > 10) score += 0.2;
    if (meta.author && meta.author.length > 5) score += 0.2;

    // 选择得分最高的 meta；若得分相同，优先选择更早创建的笔记（避免最新的图片笔记覆盖）
    if (score > bestScore) {
      bestScore = score;
      best = meta;
    } else if (Math.abs(score - bestScore) < 1e-6 && best && note.timestamp && best.timestamp) {
      // 这里 note.timestamp 是来自 note，而 best 可能没有 timestamp 字段
      // 我们需要比较对应 note 的 timestamp；简化策略：当得分相同时，不替换 best
    }
  });

  return best || (notes[0] && notes[0].meta) || {};
}

/**
 * 创建文献分组容器
 */
function createGroupContainer(notes, keywords) {
  const groupDiv = document.createElement('div');
  groupDiv.className = 'note-group';
  
  // 获取文献元数据：从组内选择最完整的 meta（避免新图片笔记覆盖已有作者等信息）
  const meta = selectBestMeta(notes) || {};
  
  // 创建分组头部
  const header = document.createElement('div');
  header.className = 'note-group-header';
  
  const title = meta.title || '无标题';
  const author = meta.author ? meta.author.split(' and ')[0] + (meta.author.includes(' and ') ? ' 等' : '') : '';
  const year = meta.year || '';
  const journal = meta.journal || '';
  const doi = meta.doi || '';
  
  let headerHTML = `<a href="${escapeHtml(meta.url || '#')}" target="_blank" class="group-title">${escapeHtml(title)}</a>`;
  
  if (author) headerHTML += `<div class="group-meta">作者: ${escapeHtml(author)}</div>`;
  if (journal || year) {
    headerHTML += `<div class="group-meta">${escapeHtml(journal)} ${year}</div>`;
  }
  if (doi) headerHTML += `<div class="group-meta">DOI: ${escapeHtml(doi)}</div>`;
  
  // 显示分组中笔记数量
  headerHTML += `<div class="group-count">${notes.length} 条摘录</div>`;
  
  header.innerHTML = headerHTML;
  groupDiv.appendChild(header);
  
  // 创建笔记列表容器
  const notesContainer = document.createElement('div');
  notesContainer.className = 'note-group-items';
  
  notes.forEach(note => {
    const card = createNoteCard(note, keywords, true); // 第三个参数表示这是在分组内
    notesContainer.appendChild(card);
  });
  
  groupDiv.appendChild(notesContainer);
  
  return groupDiv;
}

/**
 * 创建单个笔记卡片
 * @param {Object} note - 笔记对象
 * @param {Array} keywords - 所有可用的关键词
 * @param {Boolean} isInGroup - 是否在分组内（是则不显示文献信息）
 */
function createNoteCard(note, keywords, isInGroup = false) {
  const card = document.createElement('div');
  card.className = 'note-card';
  
  const meta = note.meta || {};
  
  // 如果不在分组内，显示完整的文献信息
  if (!isInGroup) {
    const title = meta.title || '无标题';
    const author = meta.author ? meta.author.split(' and ')[0] + (meta.author.includes(' and ') ? ' 等' : '') : '';
    const year = meta.year || '';
    const journal = meta.journal || '';
    const doi = meta.doi || '';
    
    let headHTML = `<a href="${escapeHtml(meta.url || '#')}" target="_blank" class="note-title">${escapeHtml(title)}</a>`;
    
    if (author) headHTML += `<div class="note-meta">作者: ${escapeHtml(author)}</div>`;
    if (journal || year) {
      headHTML += `<div class="note-meta">${escapeHtml(journal)} ${year}</div>`;
    }
    if (doi) headHTML += `<div class="note-meta">DOI: ${escapeHtml(doi)}</div>`;
    
    const head = document.createElement('div');
    head.className = 'note-head';
    head.innerHTML = headHTML;
    card.appendChild(head);
  }
  
  // 构建笔记内容
  const content = document.createElement('div');
  content.className = 'note-content';
  
  const selectedText = (note.text || '').trim();
  if (selectedText) {
    const quote = document.createElement('div');
    quote.className = 'note-quote';
    quote.textContent = `"${selectedText}"`;
    content.appendChild(quote);
  }

  // 如果笔记包含图片数据或图片 URL，则展示图片
  if ((meta && meta.imageData) || (meta && meta.imageUrl)) {
    const img = document.createElement('img');
    img.className = 'note-image';
    img.src = meta.imageData || meta.imageUrl;
    img.alt = meta.title || '图片';
    img.addEventListener('click', () => {
      // 在新标签打开原始图片链接（若有），否则打开 data URL
      const url = meta.imageUrl || meta.imageData;
      try { window.open(url, '_blank'); } catch (e) { console.warn(e); }
    });
    content.appendChild(img);
  }
  
  // 关键词显示和选择
  const noteKeywords = note.keywords || [];
  
  if (keywords.length > 0) {
    const keywordSection = document.createElement('div');
    keywordSection.className = 'note-keywords-section';
    
    // 已有的关键词标签
    if (noteKeywords.length > 0) {
      const tagContainer = document.createElement('div');
      tagContainer.className = 'note-keywords-display';
      noteKeywords.forEach(kw => {
        const tag = document.createElement('span');
        tag.className = 'keyword-label';
        tag.textContent = kw + ' ×';
        tag.style.cursor = 'pointer';
        tag.title = '点击删除';
        tag.addEventListener('click', () => {
          removeKeywordFromNote(note.id, kw);
        });
        tagContainer.appendChild(tag);
      });
      keywordSection.appendChild(tagContainer);
    }
    
    // 关键词按钮
    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'note-keywords-selector';
    keywords.forEach(kw => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keyword-btn' + (noteKeywords.includes(kw) ? ' active' : '');
      btn.textContent = kw;
      btn.addEventListener('click', () => {
        addKeywordToNote(note.id, kw);
      });
      selectorContainer.appendChild(btn);
    });
    keywordSection.appendChild(selectorContainer);
    
    content.appendChild(keywordSection);
  }
  
  // 笔记评论
  const commentArea = document.createElement('textarea');
  commentArea.className = 'note-comment';
  commentArea.placeholder = '输入笔记...';
  commentArea.value = note.comment || '';
  commentArea.addEventListener('change', () => {
    updateNoteComment(note.id, commentArea.value);
  });
  content.appendChild(commentArea);
  
  // 时间戳和删除按钮
  const footerDiv = document.createElement('div');
  footerDiv.className = 'note-footer';
  
  const timeDiv = document.createElement('div');
  timeDiv.className = 'note-time';
  if (note.timestamp) {
    const date = new Date(note.timestamp);
    timeDiv.textContent = date.toLocaleString('zh-CN');
  }
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete-note';
  deleteBtn.textContent = '🗑️ 删除';
  deleteBtn.type = 'button';
  deleteBtn.addEventListener('click', () => {
    deleteNote(note.id);
  });
  
  footerDiv.appendChild(timeDiv);
  footerDiv.appendChild(deleteBtn);
  content.appendChild(footerDiv);
  
  card.appendChild(content);
  
  return card;
}

/**
 * 为笔记添加/删除关键词
 */
function addKeywordToNote(noteId, keyword) {
  chrome.storage.local.get(['notes_v2'], (result) => {
    const notes = result.notes_v2 || [];
    const note = notes.find(n => n.id === noteId);
    
    if (!note) return;
    
    if (!note.keywords) note.keywords = [];
    
    const idx = note.keywords.indexOf(keyword);
    if (idx > -1) {
      note.keywords.splice(idx, 1);
    } else {
      note.keywords.push(keyword);
    }
    
    chrome.storage.local.set({ notes_v2: notes }, () => {
      console.log("[SidePanel] 笔记关键词已更新");
      renderNotes();
    });
  });
}

/**
 * 从笔记移除关键词
 */
function removeKeywordFromNote(noteId, keyword) {
  addKeywordToNote(noteId, keyword);
}

/**
 * 删除单个笔记
 */
function deleteNote(noteId) {
  if (!confirm('确定要删除这条笔记吗？')) {
    return;
  }
  
  chrome.storage.local.get(['notes_v2'], (result) => {
    let notes = result.notes_v2 || [];
    notes = notes.filter(n => n.id !== noteId);
    
    chrome.storage.local.set({ notes_v2: notes }, () => {
      console.log("[SidePanel] 笔记已删除");
      renderNotes();
    });
  });
}

/**
 * 更新笔记评论
 */
function updateNoteComment(noteId, comment) {
  chrome.storage.local.get(['notes_v2'], (result) => {
    const notes = result.notes_v2 || [];
    const note = notes.find(n => n.id === noteId);
    
    if (note) {
      note.comment = comment;
      chrome.storage.local.set({ notes_v2: notes });
    }
  });
}

/**
 * 清空所有笔记
 */
function clearAllNotes() {
  if (!confirm('确定要清空所有笔记吗？此操作无法撤销。')) {
    return;
  }
  
  chrome.storage.local.remove('notes_v2', () => {
    console.log("[SidePanel] 所有笔记已清空");
    renderNotes();
  });
}

/**
 * 导出为 JSON
 */
function exportAsJSON() {
  chrome.storage.local.get(['notes_v2', 'keywords'], (result) => {
    const notes = result.notes_v2 || [];
    const keywordsList = result.keywords || [];

    // 确保每条 note 包含 keywords 字段
    const normalizedNotes = notes.map(n => {
      const note = Object.assign({}, n);
      if (!Array.isArray(note.keywords)) note.keywords = [];
      if (!note.meta) note.meta = {};
      // 兼容旧字段名 tags
      if ((!note.keywords || note.keywords.length === 0) && Array.isArray(note.tags)) {
        note.keywords = note.tags.slice();
      }
      return note;
    });

    const data = {
      export_date: new Date().toISOString(),
      total_notes: normalizedNotes.length,
      keywords: keywordsList,
      notes: normalizedNotes
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadFile(blob, `notes_${Date.now()}.json`);
  });
}

/**
 * 导出为 BibTeX
 */
function exportAsBibTeX() {
  chrome.storage.local.get(['notes_v2'], (result) => {
    const notes = result.notes_v2 || [];
    
    let content = `% BibTeX 导出\n% 导出时间: ${new Date().toLocaleString()}\n% 总条目数: ${notes.length}\n\n`;
    
    notes.forEach(note => {
      const meta = note.meta || {};
      const type = meta.bibtype || 'article';
      const key = meta.bibkey || `entry_${note.id}`;
      
      content += `@${type}{${key},\n`;
      if (meta.title) content += `  title = {${meta.title}},\n`;
      if (meta.author) content += `  author = {${meta.author}},\n`;
      if (meta.year) content += `  year = {${meta.year}},\n`;
      if (meta.journal) content += `  journal = {${meta.journal}},\n`;
      if (meta.volume) content += `  volume = {${meta.volume}},\n`;
      if (meta.pages) content += `  pages = {${meta.pages}},\n`;
      if (meta.doi) content += `  doi = {${meta.doi}},\n`;
      if (note.keywords && note.keywords.length > 0) {
        content += `  keywords = {${note.keywords.join(', ')}},\n`;
      }
      content += `}\n\n`;
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    downloadFile(blob, `bibliography_${Date.now()}.bib`);
  });
}

/**
 * 处理导入的 JSON 文件
 */
function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const parsed = JSON.parse(text);

      // 支持两种格式：{ notes: [...] } 或直接数组 [...]
      const importedNotes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.notes) ? parsed.notes : null);
      const importedKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
      if (!importedNotes) {
        alert('无法解析该文件：未发现笔记数组');
        return;
      }

      mergeImportedNotes(importedNotes, importedKeywords).then((result) => {
        alert(`导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条重复，新增关键词 ${result.addedKeywords} 个`);
        renderKeywords();
        renderNotes();
      }).catch(err => {
        console.error('导入失败', err);
        alert('导入失败：' + err.message);
      });
    } catch (err) {
      console.error('解析 JSON 失败', err);
      alert('解析 JSON 失败：文件内容不是合法 JSON');
    } finally {
      // 清空 input，以便可重复选择同一文件
      event.target.value = '';
    }
  };
  reader.onerror = () => {
    alert('读取文件失败');
    event.target.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

/**
 * 合并导入的笔记到本地存储，返回 {added, skipped}
 */
async function mergeImportedNotes(importedNotes, importedKeywords) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(['notes_v2', 'keywords'], (result) => {
        const existing = result.notes_v2 || [];
        let keywords = result.keywords || [];
        const keywordSet = new Set(keywords);

        let added = 0, skipped = 0, addedKeywords = 0;
        const now = Date.now();

        // 合并顶级导入关键词
        if (Array.isArray(importedKeywords)) {
          importedKeywords.forEach(kw => {
            if (!keywordSet.has(kw)) {
              keywordSet.add(kw);
              addedKeywords++;
            }
          });
        }

        importedNotes.forEach((inNote, idx) => {
          // 规范化字段
          const note = normalizeImportedNote(inNote);

          // 如果 note.meta.category 存在，将其作为关键词加入
          if (note.meta && note.meta.category) {
            const cat = note.meta.category;
            if (!note.keywords) note.keywords = [];
            if (!note.keywords.includes(cat)) note.keywords.push(cat);
            if (!keywordSet.has(cat)) {
              keywordSet.add(cat);
              addedKeywords++;
            }
          }

          // 简单去重：若存在相同 DOI 且正文完全相同，则视为重复
          const isDup = existing.some(en => {
            const edoi = (en.meta && en.meta.doi) || '';
            const idoi = (note.meta && note.meta.doi) || '';
            if (edoi && idoi && edoi === idoi && (en.text || '') === (note.text || '')) return true;
            // 若 DOI 缺失，则用标题+文本进行严格匹配
            if (!edoi && !idoi && (en.meta && en.meta.title) && (note.meta && note.meta.title)) {
              if (en.meta.title === note.meta.title && (en.text || '') === (note.text || '')) return true;
            }
            return false;
          });

          if (isDup) {
            skipped++;
            return;
          }

          // 重新分配 id，避免冲突
          const newId = (now + idx).toString() + Math.floor(Math.random() * 1000).toString();
          note.id = newId;
          // 如果没有 ownerName，尝试从 note.meta.ownerName 或 note.ownerName 中读取
          if (!note.ownerName) note.ownerName = (note.meta && note.meta.ownerName) || note.ownerName || null;

          existing.push(note);
          added++;
        });

        // 保存合并后的关键词和笔记
        const mergedKeywords = Array.from(keywordSet);
        chrome.storage.local.set({ notes_v2: existing, keywords: mergedKeywords }, () => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve({ added, skipped, addedKeywords });
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 规范化导入的笔记对象，确保字段存在
 */
function normalizeImportedNote(inNote) {
  const note = {};
  note.id = inNote.id || null;
  note.text = inNote.text || inNote.selectedText || '';
  note.comment = inNote.comment || '';
  note.meta = inNote.meta || {};
  note.keywords = inNote.keywords || inNote.tags || [];
  note.timestamp = inNote.timestamp || Date.now();
  note.ownerName = inNote.ownerName || (inNote.meta && inNote.meta.ownerName) || null;
  return note;
}

/**
 * 下载文件
 */
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
