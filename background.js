// background.js - 简化版本
// 核心功能: 右键菜单 + 消息转发 + 数据保存

// 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-library",
    title: "收录到文献库",
    contexts: ["selection"]
  });
  // 右键图片保存
  chrome.contextMenus.create({
    id: "save-image-to-library",
    title: "收录图片到文献库",
    contexts: ["image"]
  });
});

// 右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-library") {
    handleSaveProcess(info, tab);
  } else if (info.menuItemId === "save-image-to-library") {
    // info.srcUrl 包含图片地址
    saveImageNote(info.srcUrl, tab).catch(err => console.error('保存图片失败', err));
  }
});

// 处理保存流程
async function handleSaveProcess(info, tab) {
  try {
    // 尝试从当前页面获取数据
    let result = await tryGetMetadata(tab.id);
    
    // 如果失败，自动注入脚本重试
    if (!result) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      
      // 等待初始化
      await new Promise(r => setTimeout(r, 300));
      
      // 重试
      result = await tryGetMetadata(tab.id);
    }
    
    let meta = result || {};
    
    // 如果有 DOI，从 CrossRef 补全数据
    if (meta.doi) {
      try {
        const enriched = await getCrossRefData(meta.doi);
        meta = { ...meta, ...enriched, url: meta.url };
      } catch (e) {
        console.warn("CrossRef 补全失败:", e.message);
      }
    }
    
    // 保存笔记
    await saveNote(info.selectionText, meta);
    
  } catch (error) {
    console.error("保存失败:", error);
    // 至少保存基础信息
    await saveNote(info.selectionText, {
      title: tab.title,
      url: tab.url
    });
  }
}

// 尝试获取元数据
function tryGetMetadata(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "scan-page" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("消息发送失败:", chrome.runtime.lastError.message);
        resolve(null);
      } else if (response && response.meta) {
        resolve(response.meta);
      } else {
        resolve(null);
      }
    });
  });
}

// 从 CrossRef 获取数据（BibTeX 完整格式）
async function getCrossRefData(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const response = await fetch(url);
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const json = await response.json();
  const work = json.message;
  
  if (!work) throw new Error("无数据");
  
  // 标准化作者 (BibTeX 格式: "First Last and First Last")
  let author = "";
  let author_short = "";
  if (work.author && work.author.length > 0) {
    const authors = work.author.map((a, idx) => {
      const name = [a.given, a.family].filter(Boolean).join(" ");
      return name;
    }).filter(Boolean);
    author = authors.join(" and ");
    author_short = authors.length > 0 ? authors[0].split(" ").pop() : ""; // 姓氏
    if (authors.length > 1) author_short += " et al.";
  }
  
  // 提取年份
  let year = "";
  if (work.issued?.["date-parts"]?.[0]) {
    year = work.issued["date-parts"][0][0].toString();
  } else if (work.created?.["date-parts"]?.[0]) {
    year = work.created["date-parts"][0][0].toString();
  }
  
  // 完整日期
  const date_parts = work.issued?.["date-parts"]?.[0] || work.created?.["date-parts"]?.[0] || [];
  let month = "";
  if (date_parts[1]) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    month = months[date_parts[1] - 1] || "";
  }
  
  // 卷号和期号
  const volume = work.volume || "";
  const issue = work.issue || "";
  
  // 页码
  let pages = "";
  if (work.page) {
    pages = work.page;
  }
  
  // 类型判断 (article, inproceedings, book 等)
  let entryType = "article";
  if (work.type) {
    if (work.type.toLowerCase().includes("book")) entryType = "book";
    else if (work.type.toLowerCase().includes("proceeding")) entryType = "inproceedings";
    else if (work.type.toLowerCase().includes("chapter")) entryType = "inbook";
  }
  
  // BibTeX key 生成 (LastName+Year+FirstWord)
  const titleWord = work.title?.[0]?.split(" ")[0] || "untitled";
  const bibkey = `${author_short.replace(/\s+et al.*/, "")}${year}${titleWord}`.replace(/[^\w]/g, "").toLowerCase();
  
  return {
    // 基本字段
    title: work.title?.[0] || "",
    author: author,
    year: year,
    month: month,
    
    // 期刊字段
    journal: work["container-title"]?.[0] || "",
    volume: volume,
    issue: issue,
    pages: pages,
    
    // 其他字段
    publisher: work.publisher || "",
    doi: work.DOI || doi,
    abstract: work.abstract || "",
    keywords: work.subject?.join(", ") || "",
    issn: work.ISSN?.[0] || "",
    
    // URL 和相关信息
    url: work.URL || "",
    note: "",
    
    // BibTeX 特定字段
    bibtype: entryType,
    bibkey: bibkey,
    
    // 编辑和版本 (如果有)
    editor: work.editor ? work.editor.map(e => `${e.given} ${e.family}`.trim()).join(" and ") : "",
    edition: work.edition || ""
  };
}

// 保存笔记到存储
function saveNote(text, meta) {
  return new Promise((resolve, reject) => {
    // 如果是图片笔记且传入空字符串，则保留空字符串而不是使用默认占位文字
    const textValue = (text === '' && meta && (meta.imageData || meta.imageUrl))
      ? ''
      : (text || "（无文字）");

    const note = {
      id: Date.now().toString(),
      text: textValue,
      comment: "",
      meta: meta || {},
      keywords: [],  // 初始化关键词数组
      timestamp: Date.now()
    };
    
    chrome.storage.local.get(["notes_v2"], (result) => {
      const notes = result.notes_v2 || [];
      notes.push(note);
      chrome.storage.local.set({ notes_v2: notes }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

// 将图片 URL fetch 并转为 dataURL，然后保存为笔记
async function saveImageNote(srcUrl, tab) {
  try {
    // 先尝试从页面获取元信息（与文字摘录流程一致）
    let pageMeta = null;
    try {
      if (tab && typeof tab.id === 'number') {
        pageMeta = await tryGetMetadata(tab.id);
        console.log('saveImageNote: 页面元信息：', pageMeta);
      } else {
        console.log('saveImageNote: 无法读取 tab.id，跳过页面元信息请求');
      }
    } catch (e) {
      console.warn('saveImageNote: 获取页面元信息失败', e);
    }

    // 尝试获取图片数据
    const resp = await fetch(srcUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const dataUrl = await blobToDataURL(blob);

    // 将页面元信息合并到 meta 中，优先使用 pageMeta 的字段
    const meta = Object.assign({}, pageMeta || {}, {
      title: (pageMeta && pageMeta.title) ? pageMeta.title : (tab.title || ''),
      url: (pageMeta && pageMeta.url) ? pageMeta.url : (tab.url || ''),
      imageData: dataUrl,
      imageUrl: srcUrl
    });

    console.log('saveImageNote: 最终保存的 meta:', meta);

    await saveNote('', meta);
  } catch (e) {
    console.error('saveImageNote 错误', e);
    // 仍尝试保存带有 imageUrl 的元数据（若 fetch 失败）
    await saveNote('', { title: tab.title || '', url: tab.url || '', imageUrl: srcUrl });
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
