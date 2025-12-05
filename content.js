// content.js - DOI 三级提取策略 + 元数据解析
// 支持 Wiley, Nature, arXiv 等多个学术平台

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan-page") {
    try {
      const meta = extractMetadata();
      sendResponse({ success: true, meta: meta });
    } catch (e) {
      console.error("content.js 错误:", e);
      sendResponse({ success: false, error: e.message });
    }
  }
  // 必须返回 true 以支持异步 sendResponse
  return true;
});

/**
 * 三级 DOI 提取策略
 * 优先级 1: JSON-LD (ScholarlyArticle, Article)
 * 优先级 2: URL 正则匹配 (对 Wiley 等网站关键)
 * 优先级 3: <meta> 标签 (Highwire Press, Dublin Core)
 */
function extractMetadata() {
  const url = window.location.href;
  
  // ===== 优先级 1: JSON-LD 解析 =====
  let jsonLd = parseJsonLd();
  
  // ===== 优先级 2: URL 中提取 DOI (对 Wiley 最关键) =====
  let urlDoi = extractDoiFromUrl(url);
  
  // ===== 优先级 3: <meta> 标签 =====
  let metaTags = parseMetaTags();
  
  // ===== 合并数据 (DOI 优先级最高) =====
  const result = {
    title: jsonLd.title || metaTags.title || document.title,
    url: url,
    // DOI: URL 提取优先，其次 JSON-LD，再其次 meta 标签
    doi: urlDoi || jsonLd.doi || metaTags.doi || "",
    author: jsonLd.author || metaTags.author || "",
    journal: jsonLd.journal || metaTags.journal || "",
    date: jsonLd.date || metaTags.date || "",
    publisher: jsonLd.publisher || metaTags.publisher || "",
    abstract: jsonLd.abstract || metaTags.abstract || ""
  };
  
  console.log("[Research Clipper] 提取的元数据:", result);
  return result;
}

/**
 * 从 JSON-LD 中解析元数据
 * 支持 ScholarlyArticle, Article 类型
 */
function parseJsonLd() {
  const result = {};
  
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    scripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        
        items.forEach(item => {
          // 支持 ScholarlyArticle, Article 类型
          if (item["@type"] === "ScholarlyArticle" || item["@type"] === "Article") {
            // 标题
            if (item.headline && !result.title) {
              result.title = item.headline;
            }
            
            // 日期
            if (item.datePublished && !result.date) {
              result.date = item.datePublished;
            }
            
            // 作者
            if (item.author && !result.author) {
              const authors = Array.isArray(item.author) ? item.author : [item.author];
              result.author = authors
                .map(a => a.name || a)
                .join(" and ");
            }
            
            // 期刊
            if (item.isPartOf?.name && !result.journal) {
              result.journal = item.isPartOf.name;
            }
            
            // DOI (关键！)
            if (item.identifier && !result.doi) {
              // identifier 可能是字符串或对象数组
              if (typeof item.identifier === "string" && item.identifier.includes("10.")) {
                result.doi = item.identifier.split("/").slice(-2).join("/");
              } else if (Array.isArray(item.identifier)) {
                const doi = item.identifier.find(id => id.includes?.("10.") || id?.includes?.("doi"));
                if (doi) result.doi = doi;
              }
            }
            
            // 备用 DOI 字段
            if ((item.doi || item.sameAs) && !result.doi) {
              const doi = item.doi || item.sameAs;
              if (typeof doi === "string" && doi.includes("10.")) {
                result.doi = doi.replace("https://doi.org/", "");
              }
            }
            
            // 摘要
            if (item.description && !result.abstract) {
              result.abstract = item.description;
            }
            
            // 出版社
            if (item.publisher && !result.publisher) {
              result.publisher = typeof item.publisher === "string" 
                ? item.publisher 
                : item.publisher.name;
            }
          }
        });
      } catch (e) {
        console.warn("JSON-LD 解析失败:", e);
      }
    });
  } catch (e) {
    console.warn("JSON-LD 查询失败:", e);
  }
  
  return result;
}

/**
 * 从 URL 中提取 DOI
 * 支持多种 URL 格式:
 * - https://onlinelibrary.wiley.com/doi/10.1002/xxxx
 * - https://www.nature.com/articles/10.1038/xxxx
 * - https://arxiv.org/abs/2101.12345 (arXiv ID)
 */
function extractDoiFromUrl(url) {
  try {
    // 标准 DOI 正则: 10.XXXX/YYYY (其中 YYYY 可以包含特殊字符)
    const doiPattern = /10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i;
    const match = url.match(doiPattern);
    
    if (match) {
      return match[0];
    }
  } catch (e) {
    console.warn("URL DOI 提取失败:", e);
  }
  
  return "";
}

/**
 * 从 <meta> 标签中提取元数据
 * 支持:
 * - Highwire Press (citation_*)
 * - Dublin Core (DC.*, DCTERMS.*)
 * - Open Graph (og:*)
 * - Twitter Card (twitter:*)
 */
function parseMetaTags() {
  const result = {};
  
  const metaTags = document.querySelectorAll("meta");
  
  metaTags.forEach(meta => {
    const name = (meta.getAttribute("name") || meta.getAttribute("property") || "").toLowerCase();
    const content = meta.getAttribute("content") || "";
    
    if (!content) return;
    
    // Highwire Press 标签
    if (name === "citation_title") result.title = content;
    if (name === "citation_authors") result.author = content;
    if (name === "citation_publication_date") result.date = content;
    if (name === "citation_journal_title") result.journal = content;
    if (name === "citation_doi") result.doi = content;
    if (name === "citation_publisher") result.publisher = content;
    if (name === "citation_abstract") result.abstract = content;
    
    // Dublin Core 标签
    if (name === "dc.title" || name === "dcterms.title") result.title = content;
    if (name === "dc.creator" || name === "dcterms.creator") result.author = content;
    if (name === "dc.date" || name === "dcterms.date") result.date = content;
    if (name === "dc.identifier") {
      if (content.includes("10.")) result.doi = content.replace("doi:", "").trim();
    }
    
    // Open Graph
    if (name === "og:title" && !result.title) result.title = content;
    if (name === "og:description" && !result.abstract) result.abstract = content;
    
    // 通用描述标签
    if (name === "description" && !result.abstract) result.abstract = content;
  });
  
  return result;
}
