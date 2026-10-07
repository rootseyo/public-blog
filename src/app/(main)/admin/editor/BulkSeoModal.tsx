'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sparkles, ClipboardPaste, RotateCcw, HelpCircle, Check, X, Tag, Globe, FileText, AlignLeft } from 'lucide-react';
import styles from './bulkSeo.module.css';

export interface BulkSeoParsedData {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogTitle: string;
  ogDescription: string;
  thumbnailAlt: string;
}

export function parseBulkSeoText(rawText: string): BulkSeoParsedData {
  if (!rawText || !rawText.trim()) {
    return { slug: '', metaTitle: '', metaDescription: '', metaKeywords: '', ogTitle: '', ogDescription: '', thumbnailAlt: '' };
  }

  // 1. Try JSON parse first
  try {
    let jsonStr = rawText.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
      const parsed = JSON.parse(jsonStr);
      const res: Partial<BulkSeoParsedData> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const key = k.toLowerCase().replace(/[-_\s]/g, '');
        const val = Array.isArray(v) ? v.join(', ') : String(v ?? '');
        if (key.includes('ogtitle') || key.includes('opengraphtitle')) res.ogTitle = cleanGeneral(val);
        else if (key.includes('ogdescription') || key.includes('opengraphdescription')) res.ogDescription = cleanGeneral(val);
        else if (key.includes('thumbnailalt') || key.includes('imagealt')) res.thumbnailAlt = cleanGeneral(val);
        else if (key.includes('slug')) res.slug = cleanSlug(val);
        else if (key.includes('title')) res.metaTitle = cleanGeneral(val);
        else if (key.includes('desc')) res.metaDescription = cleanGeneral(val);
        else if (key.includes('key') || key.includes('tag')) res.metaKeywords = cleanKeywords(val);
      }
      if (Object.values(res).some(Boolean)) {
        return {
          slug: res.slug || '',
          metaTitle: res.metaTitle || '',
          metaDescription: res.metaDescription || '',
          metaKeywords: res.metaKeywords || '',
          ogTitle: res.ogTitle || '', ogDescription: res.ogDescription || '', thumbnailAlt: res.thumbnailAlt || '',
        };
      }
    }
  } catch {
    // Ignore JSON parsing errors and proceed with line-by-line parsing
  }

  // 2. Line by line parsing
  const lines = rawText.split(/\r?\n/);
  const collected: { [key in keyof BulkSeoParsedData]: string[] } = {
    slug: [],
    metaTitle: [],
    metaDescription: [],
    metaKeywords: [],
    ogTitle: [], ogDescription: [], thumbnailAlt: [],
  };

  let currentKey: keyof BulkSeoParsedData | null = null;

  const headerPatterns: { key: keyof BulkSeoParsedData; regex: RegExp }[] = [
    { key: 'ogTitle', regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:og\s*title|open\s*graph\s*title|오지\s*타이틀|og\s*제목)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i },
    { key: 'ogDescription', regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:og\s*description|open\s*graph\s*description|og\s*설명)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i },
    { key: 'thumbnailAlt', regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:thumbnail\s*alt|image\s*alt|썸네일\s*alt|썸네일\s*대체\s*텍스트)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i },
    {
      key: 'slug',
      regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:slug\s*url|url\s*slug|post\s*slug|slug|url\s*슬러그|슬러그\s*url|슬러그)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i,
    },
    {
      key: 'metaTitle',
      regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:meta\s*title|seo\s*title|meta\s*제목|메타\s*타이틀|메타\s*제목|seo\s*제목|메타제목|메타타이틀|포스트\s*제목|title|제목)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i,
    },
    {
      key: 'metaDescription',
      regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:meta\s*description|seo\s*description|meta\s*설명|메타\s*설명|메타\s*디스크립션|seo\s*설명|메타설명|메타디스크립션|description|디스크립션|설명|요약)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i,
    },
    {
      key: 'metaKeywords',
      regex: /^(?:[\d\.\*\-#\s\[\]]*)\*{0,2}(?:meta\s*keywords?|seo\s*keywords?|meta\s*키워드|메타\s*키워드|seo\s*키워드|메타키워드|keywords?|키워드|tags?|태그)\*{0,2}[\]\)]*\s*[:\-–—]?\s*(.*)$/i,
    },
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // If we are currently collecting description, preserve newline
      if (currentKey === 'metaDescription' && collected.metaDescription.length > 0) {
        collected.metaDescription.push('');
      }
      continue;
    }

    let matchedHeader = false;
    for (const { key, regex } of headerPatterns) {
      const match = trimmed.match(regex);
      if (match) {
        currentKey = key;
        matchedHeader = true;
        const inlineVal = match[1]?.trim();
        if (inlineVal) {
          collected[key].push(inlineVal);
        }
        break;
      }
    }

    if (!matchedHeader && currentKey) {
      collected[currentKey].push(trimmed);
    }
  }

  function cleanSlug(val: string) {
    if (!val) return '';
    let s = val.trim();
    s = s.replace(/^[`"'“‘\*]+|[`"'”’\*]+$/g, '').trim();
    s = s.replace(/^https?:\/\/[^\/]+\/posts\//i, '');
    s = s.replace(/^https?:\/\/[^\/]+\//i, '');
    s = s.replace(/^\/posts\//i, '');
    s = s.replace(/^\/+|\/+$/g, '');
    return s.trim();
  }

  function cleanGeneral(val: string) {
    if (!val) return '';
    let s = val.trim();
    s = s.replace(/^[`"'“‘\*]+|[`"'”’\*]+$/g, '').trim();
    return s;
  }

  function cleanKeywords(val: string) {
    if (!val) return '';
    let s = val.trim();
    s = s.replace(/^[`"'“‘\*]+|[`"'”’\*]+$/g, '').trim();
    if (s.includes('#')) {
      const tags = s.match(/#([^\s#,]+)/g);
      if (tags && tags.length > 0) {
        return tags.map(t => t.replace(/^#/, '').trim()).filter(Boolean).join(', ');
      }
    }
    return s
      .split(/[,\n]/)
      .map(k => k.replace(/^[\s*\-•]+/, '').replace(/^[`"'“‘\*]+|[`"'”’\*]+$/g, '').trim())
      .filter(Boolean)
      .join(', ');
  }

  const rawSlug = collected.slug.join(' ');
  const rawTitle = collected.metaTitle.join(' ');
  const rawDesc = collected.metaDescription
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const rawKeywords = collected.metaKeywords.join('\n');
  const cleanCollected = (key: keyof BulkSeoParsedData) => cleanGeneral(collected[key].join(key === 'ogDescription' ? '\n' : ' '));

  return {
    slug: cleanSlug(rawSlug),
    metaTitle: cleanGeneral(rawTitle),
    metaDescription: cleanGeneral(rawDesc),
    metaKeywords: cleanKeywords(rawKeywords),
    ogTitle: cleanCollected('ogTitle'), ogDescription: cleanCollected('ogDescription'), thumbnailAlt: cleanCollected('thumbnailAlt'),
  };
}

const SAMPLE_EXAMPLE_TEXT = `**Slug URL**
\`complainers-in-the-ai-era\`

**Meta Title**
회사의 투덜이는 AI 시대에 어떻게 될 것인가?

**Meta Description**
문제는 잘 찾지만 해결에는 기여하지 않는 사람은 AI 시대에 어떤 경쟁력을 가질 수 있을까요? 투덜거림의 유형과 원인, 팔로워십·리더십·커뮤니케이션의 중요성을 통해 사람이 해야 할 일을 생각해봅니다.

**Meta Keywords**
AI 시대, 직장인 태도, 회사 투덜이, 부정적인 직원, 문제 해결 능력, 팔로워십, 리더십, 커뮤니케이션, 직장생활, 조직문화, AI 대체, 직장인 경쟁력, 업무 태도, 협업 능력, 인간관계, 프로페셔널`;

interface BulkSeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: BulkSeoParsedData & { applyToTitle: boolean }) => void;
  currentTitle?: string;
}

export default function BulkSeoModal({ isOpen, onClose, onApply, currentTitle }: BulkSeoModalProps) {
  const [rawText, setRawText] = useState('');
  const [applyToTitle, setApplyToTitle] = useState(!currentTitle);

  const parsed = useMemo(() => parseBulkSeoText(rawText), [rawText]);

  const detectedCount = useMemo(() => {
    let count = 0;
    if (parsed.slug) count++;
    if (parsed.metaTitle) count++;
    if (parsed.metaDescription) count++;
    if (parsed.metaKeywords) count++;
    if (parsed.ogTitle) count++;
    if (parsed.ogDescription) count++;
    if (parsed.thumbnailAlt) count++;
    return count;
  }, [parsed]);

  const handleApply = useCallback(() => {
    if (detectedCount === 0) {
      alert('분석된 SEO 정보가 없습니다. 텍스트를 입력해 주세요.');
      return;
    }
    onApply({
      ...parsed,
      applyToTitle,
    });
    onClose();
  }, [detectedCount, onApply, parsed, applyToTitle, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (detectedCount > 0) {
          handleApply();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, detectedCount, handleApply, onClose]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setRawText(clipText);
      }
    } catch {
      alert('클립보드 접근 권한이 없거나 지원되지 않습니다. 텍스트 영역에 직접 Ctrl+V 또는 Cmd+V로 붙여넣어 주세요.');
    }
  };

  const keywordList = parsed.metaKeywords
    ? parsed.metaKeywords.split(',').map(k => k.trim()).filter(Boolean)
    : [];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className={styles.modalTitle}>SEO 메타데이터 일괄 붙여넣기</h2>
              <div className={styles.modalSubtitle}>
                AI(ChatGPT, Claude 등)에서 복사한 SEO 텍스트를 붙여넣으면 Slug, Meta Title, Description, Keywords를 자동 추출합니다.
              </div>
            </div>
          </div>
          <button onClick={onClose} className={styles.closeButton} title="닫기 (Esc)">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {/* Left Column: Input */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>
              <span className={styles.columnTitle}>
                <FileText size={16} /> 원본 텍스트 붙여넣기
              </span>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className={styles.quickBtn}
                  title="클립보드에서 바로 가져오기"
                >
                  <ClipboardPaste size={13} /> 붙여넣기
                </button>
                <button
                  type="button"
                  onClick={() => setRawText(SAMPLE_EXAMPLE_TEXT)}
                  className={styles.quickBtn}
                  title="예시 텍스트 입력"
                >
                  <HelpCircle size={13} /> 예시
                </button>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => setRawText('')}
                    className={styles.quickBtn}
                    title="입력 내용 지우기"
                  >
                    <RotateCcw size={13} /> 비우기
                  </button>
                )}
              </div>
            </div>
            <div className={styles.textareaWrapper}>
              <textarea
                className={styles.rawTextarea}
                placeholder={`여기에 AI가 생성한 SEO 텍스트를 통째로 붙여넣으세요.\n\n예시:\n**Slug URL**\ncomplainers-in-the-ai-era\n\n**Meta Title**\n회사의 투덜이는 AI 시대에 어떻게 될 것인가?\n\n**Meta Description**\n문제는 잘 찾지만 해결에는 기여하지 않는 사람은...\n\n**Meta Keywords**\nAI 시대, 직장인 태도, 회사 투덜이`}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Right Column: Live Preview */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>
              <span className={styles.columnTitle}>
                <Check size={16} color="#10b981" /> 실시간 분석 결과 ({detectedCount}/4)
              </span>
            </div>

            <div className={styles.previewContainer}>
              {/* Slug */}
              <div className={`${styles.previewCard} ${parsed.slug ? styles.previewCardActive : ''}`}>
                <div className={styles.previewCardHeader}>
                  <span className={styles.previewLabel}>
                    <Globe size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                    URL 슬러그 (Slug)
                  </span>
                  <span className={`${styles.badge} ${parsed.slug ? styles.badgeSuccess : styles.badgeEmpty}`}>
                    {parsed.slug ? <><Check size={10} /> 감지됨</> : '미감지'}
                  </span>
                </div>
                <div className={styles.previewValue}>
                  {parsed.slug ? (
                    <span className={styles.previewValueCode}>{parsed.slug}</span>
                  ) : (
                    <span className={styles.emptyHint}>슬러그 URL이 감지되지 않았습니다.</span>
                  )}
                </div>
              </div>

              {/* Meta Title */}
              <div className={`${styles.previewCard} ${parsed.metaTitle ? styles.previewCardActive : ''}`}>
                <div className={styles.previewCardHeader}>
                  <span className={styles.previewLabel}>
                    <FileText size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                    메타 타이틀 (Meta Title)
                  </span>
                  <span className={`${styles.badge} ${parsed.metaTitle ? styles.badgeSuccess : styles.badgeEmpty}`}>
                    {parsed.metaTitle ? <><Check size={10} /> {parsed.metaTitle.length}자</> : '미감지'}
                  </span>
                </div>
                <div className={styles.previewValue}>
                  {parsed.metaTitle || <span className={styles.emptyHint}>메타 타이틀이 감지되지 않았습니다.</span>}
                </div>
              </div>

              {/* Meta Description */}
              <div className={`${styles.previewCard} ${parsed.metaDescription ? styles.previewCardActive : ''}`}>
                <div className={styles.previewCardHeader}>
                  <span className={styles.previewLabel}>
                    <AlignLeft size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                    메타 설명 (Meta Description)
                  </span>
                  <span className={`${styles.badge} ${parsed.metaDescription ? styles.badgeSuccess : styles.badgeEmpty}`}>
                    {parsed.metaDescription ? <><Check size={10} /> {parsed.metaDescription.length}자</> : '미감지'}
                  </span>
                </div>
                <div className={styles.previewValue}>
                  {parsed.metaDescription || <span className={styles.emptyHint}>메타 설명이 감지되지 않았습니다.</span>}
                </div>
              </div>

              {/* Meta Keywords */}
              <div className={`${styles.previewCard} ${parsed.metaKeywords ? styles.previewCardActive : ''}`}>
                <div className={styles.previewCardHeader}>
                  <span className={styles.previewLabel}>
                    <Tag size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                    메타 키워드 (Meta Keywords)
                  </span>
                  <span className={`${styles.badge} ${parsed.metaKeywords ? styles.badgeSuccess : styles.badgeEmpty}`}>
                    {parsed.metaKeywords ? <><Check size={10} /> {keywordList.length}개</> : '미감지'}
                  </span>
                </div>
                <div className={styles.previewValue}>
                  {keywordList.length > 0 ? (
                    <div className={styles.previewKeywordsList}>
                      {keywordList.map((kw, idx) => (
                        <span key={idx} className={styles.keywordChip}>
                          #{kw}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.emptyHint}>메타 키워드가 감지되지 않았습니다.</span>
                  )}
                </div>
              </div>

              {/* Options */}
              {parsed.metaTitle && (
                <div className={styles.optionsSection}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={applyToTitle}
                      onChange={(e) => setApplyToTitle(e.target.checked)}
                    />
                    <span>메인 글 제목(Title)에도 메타 타이틀 함께 적용하기</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.footerStatus}>
            {detectedCount > 0 ? (
              <span>✨ {detectedCount}개 항목이 감지되었습니다. (Cmd/Ctrl + Enter로 바로 적용)</span>
            ) : (
              <span>텍스트를 입력하면 분석 결과가 나타납니다.</span>
            )}
          </div>
          <div className={styles.footerButtons}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              취소
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={detectedCount === 0}
              className={styles.applyBtn}
            >
              <Sparkles size={16} /> 에디터에 적용하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
