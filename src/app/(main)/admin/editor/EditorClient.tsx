'use client';

import { useEditor, EditorContent, Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes, Mark, Extension, ReactRenderer, NodeViewContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import Mention from '@tiptap/extension-mention';
import Suggestion from '@tiptap/suggestion';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { savePost, getPost, updatePost, fetchOgData } from './actions';
import { getCategories } from '../actions';
import { compressImage } from '@/lib/client-utils';
import styles from './editor.module.css';
import adminStyles from '../admin.module.css';
import beautify from 'js-beautify';
import LogoutButton from '../LogoutButton';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';

import BulkSeoModal, { BulkSeoParsedData } from './BulkSeoModal';

import { AlignLeft, AlignCenter, AlignRight, MoreHorizontal, Highlighter, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Code, Quote, Link as LinkIcon, Trash2, Type, Zap, ChevronLeft, ChevronRight, Plus, Image as ImageIcon, Video, BarChart2, Palette, Sparkles } from 'lucide-react';

const PdfSlideViewer = dynamic(() => import('./PdfSlideViewer'), { ssr: false });
const ImageSlideViewer = dynamic(() => import('./ImageSlideViewer'), { ssr: false });
const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), { ssr: false });

interface UploadResponse {
  url?: string;
}

const LinkPreviewNodeView = (props: any) => {
  const { title, description, image, url, siteName } = props.node.attrs;

  const convertToPlainText = () => {
    const { editor, getPos } = props;
    const pos = getPos();
    editor.chain().focus().deleteRange({ from: pos, to: pos + props.node.nodeSize }).insertContent({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: url } }],
          text: url,
        },
      ],
    }).run();
  };

  const removeNode = () => {
    const { editor, getPos } = props;
    editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + props.node.nodeSize }).run();
  };

  return (
    <NodeViewWrapper className="link-preview-node">
      <div className={styles.linkPreviewNodeWrapper}>
        <div className={styles.linkPreviewActionMenu}>
          <button onClick={convertToPlainText} className={styles.linkPreviewActionButton} title="일반 텍스트 링크로 변환">
            <Type size={14} /> 텍스트로 변환
          </button>
          <button onClick={removeNode} className={styles.linkPreviewActionButton} title="삭제">
            <Trash2 size={14} />
          </button>
        </div>
        <div className={styles.linkPreviewWrapper} onClick={(e) => {
          // If the user clicks the title area, we can also offer conversion
          if ((e.target as HTMLElement).className.includes('linkPreviewTitle')) {
            if (confirm('이 링크를 일반 텍스트 링크로 변환할까요?')) {
              convertToPlainText();
            }
          }
        }}>
          {image && <img src={image} alt={title} className={styles.linkPreviewImage} />}
          <div className={styles.linkPreviewContent}>
            {siteName && <div className={styles.linkPreviewSite}>{siteName}</div>}
            <div className={styles.linkPreviewTitle}>{title || url}</div>
            {description && <div className={styles.linkPreviewDescription}>{description}</div>}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

const LinkPreviewExtension = Node.create({
  name: 'linkPreview',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      image: { default: null },
      siteName: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="link-preview"]',
        getAttrs: (node: any) => ({
          url: node.getAttribute('data-url'),
          title: node.getAttribute('data-title'),
          description: node.getAttribute('data-description'),
          image: node.getAttribute('data-image'),
          siteName: node.getAttribute('data-site-name'),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { url, title, description, image, siteName, ...rest } = HTMLAttributes;
    return [
      'div',
      mergeAttributes(rest, {
        'data-type': 'link-preview',
        'data-url': url,
        'data-title': title,
        'data-description': description,
        'data-image': image,
        'data-site-name': siteName,
      }),
      [
        'a',
        { href: url, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration: none; color: inherit;' },
        ['div', { class: 'link-preview-banner' },
          image ? ['img', { src: image, style: 'width: 100%; height: 200px; object-fit: cover;' }] : '',
          ['div', { style: 'padding: 1rem;' },
            siteName ? ['div', { style: 'font-size: 0.75rem; color: #888;' }, siteName] : '',
            ['div', { style: 'font-weight: bold; margin: 0.5rem 0;' }, title || url],
            description ? ['div', { style: 'font-size: 0.9rem; color: #666;' }, description] : ''
          ]
        ]
      ]
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LinkPreviewNodeView);
  },
});

// Custom Highlight extension
const CustomHighlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: '#fff3bf',
        parseHTML: element => element.style.backgroundColor || '#fff3bf',
        renderHTML: attributes => {
          return {
            style: `background-color: ${attributes.color}; color: inherit; padding: 0.1rem 0.3rem; border-radius: 4px;`,
          }
        },
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'mark' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },
});

// Custom TextColor extension
const TextColor = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: element => element.style.color || null,
        renderHTML: attributes => {
          if (!attributes.color) {
            return {};
          }
          return {
            style: `color: ${attributes.color};`,
          };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: element => {
          const hasColor = (element as HTMLElement).style.color;
          return hasColor ? {} : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setColor: (color: string) => ({ chain }: any) => {
        return chain()
          .setMark(this.name, { color })
          .run();
      },
      unsetColor: () => ({ chain }: any) => {
        return chain()
          .unsetMark(this.name)
          .run();
      },
    } as any;
  },
});

const wrapEcharts = (echarts: any) => {
  if (!echarts || echarts.__wrapped) return echarts;
  
  // Create a new object to avoid modifying the read-only ES module namespace object directly
  const wrappedEcharts = Object.create(echarts);
  
  const originalInit = echarts.init;
  Object.defineProperty(wrappedEcharts, 'init', {
    value: function (dom: any, theme: any, opts: any) {
      const chart = originalInit.call(echarts, dom, theme, opts);
      
      if (dom) {
        const ro = new ResizeObserver(() => {
          chart.resize();
        });
        ro.observe(dom);
        (chart as any).__resizeObserver = ro;
      }
      
      const originalSetOption = chart.setOption;
      chart.setOption = function (option: any, notMerge: any, lazyUpdate: any) {
        if (option && typeof option === 'object') {
          if (option.grid) {
            const makeGridResponsive = (g: any) => {
              if (g && typeof g === 'object') {
                if (g.containLabel === undefined) g.containLabel = true;
              }
            };
            if (Array.isArray(option.grid)) {
              option.grid.forEach(makeGridResponsive);
            } else {
              makeGridResponsive(option.grid);
            }
          } else {
            option.grid = { containLabel: true };
          }

          if (option.legend) {
            const makeLegendResponsive = (leg: any) => {
              if (leg && typeof leg === 'object') {
                if (leg.type === undefined) leg.type = 'scroll';
                
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  if (leg.orient === undefined) leg.orient = 'horizontal';
                  if (leg.bottom === undefined && leg.top === undefined) {
                    leg.bottom = 10;
                  }
                }
              }
            };
            if (Array.isArray(option.legend)) {
              option.legend.forEach(makeLegendResponsive);
            } else {
              makeLegendResponsive(option.legend);
            }
          }
        }
        return originalSetOption.call(this, option, notMerge, lazyUpdate);
      };
      
      return chart;
    },
    writable: true,
    configurable: true,
    enumerable: true
  });
  
  wrappedEcharts.__wrapped = true;
  return wrappedEcharts;
};

// Extend Heading and Paragraph to support alignment
const CustomHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: 'left',
        parseHTML: element => element.style.textAlign || 'left',
        renderHTML: attributes => ({
          style: `text-align: ${attributes.textAlign}`,
        }),
      },
    };
  },
});

const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: 'left',
        parseHTML: element => element.style.textAlign || 'left',
        renderHTML: attributes => ({
          style: `text-align: ${attributes.textAlign}`,
        }),
      },
    };
  },
});

const CustomBulletList = BulletList.extend({
  addInputRules() {
    return []
  },
});

const CustomOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      type: {
        default: '1',
        parseHTML: element => element.getAttribute('type') || '1',
        renderHTML: attributes => ({
          type: attributes.type,
        }),
      },
    };
  },
  addInputRules() {
    return []
  },
});

const CustomCssNodeView = (props: any) => {
  const { cssContent } = props.node.attrs;
  const isSelected = props.selected;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.updateAttributes({
      cssContent: e.target.value,
    });
  };

  return (
    <NodeViewWrapper
      className={`custom-css-node-view ${isSelected ? 'ProseMirror-selectednode' : ''}`}
      style={{
        margin: '2rem 0',
        padding: '1.25rem',
        background: '#0f172a',
        borderRadius: '12px',
        border: isSelected ? '2px solid #38bdf8' : '1px solid #334155',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        color: '#f8fafc',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Palette size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 'bold' }}>CSS 매크로</span>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>이 글에만 적용될 전용 스타일 시트</span>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            props.deleteNode();
          }}
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '0.8rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '6px',
            fontWeight: 'bold',
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
          title="삭제"
        >
          삭제
        </button>
      </div>
      <textarea
        value={cssContent || ''}
        onChange={handleChange}
        placeholder="/* 여기에 CSS 코드를 입력하세요. 예: body { background: #f8f9fa; } */"
        style={{
          width: '100%',
          height: '240px',
          background: '#020617',
          color: '#e2e8f0',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '0.8rem',
          fontFamily: 'Consolas, Monaco, ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.85rem',
          lineHeight: '1.6',
          resize: 'vertical',
          outline: 'none',
        }}
      />
    </NodeViewWrapper>
  );
};

const CustomCssExtension = Node.create({
  name: 'customCss',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      cssContent: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'style[data-type="custom-css"]',
        getAttrs: (node: any) => ({
          cssContent: node.textContent || '',
        }),
      },
      {
        tag: 'style',
        getAttrs: (node: any) => {
          return {
            cssContent: node.textContent || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { cssContent } = HTMLAttributes;
    return [
      'style',
      { 'data-type': 'custom-css' },
      cssContent || '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CustomCssNodeView);
  },
});

const ScriptNodeView = (props: any) => {
  const { scriptContent } = props.node.attrs;
  const isSelected = props.selected;

  const [showPreview, setShowPreview] = useState(true);
  const [echartsLoaded, setEchartsLoaded] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [debouncedScript, setDebouncedScript] = useState(scriptContent);
  const [detectedIds, setDetectedIds] = useState<string[]>([]);
  const callbackNameRef = useRef('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.updateAttributes({
      scriptContent: e.target.value,
    });
  };

  // ECharts dynamic import
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ((window as any).echarts) {
        setEchartsLoaded(true);
      } else {
        import('echarts').then((echarts) => {
          (window as any).echarts = wrapEcharts(echarts);
          setEchartsLoaded(true);
        }).catch(err => {
          console.error('Failed to load echarts inside editor preview', err);
        });
      }
    }
  }, []);

  // Debounce scriptContent
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedScript(scriptContent);
    }, 400);
    return () => clearTimeout(handler);
  }, [scriptContent]);

  // Handle preview error callback registration (Isolated per instance)
  useEffect(() => {
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const callbackName = `__chartPreviewErrorCallback_${uniqueId}`;
    callbackNameRef.current = callbackName;

    (window as any)[callbackName] = (errorMsg: string | null) => {
      setPreviewError(errorMsg);
    };
    return () => {
      delete (window as any)[callbackName];
    };
  }, []);

  // Detect DOM IDs in script
  useEffect(() => {
    if (!debouncedScript) {
      setDetectedIds([]);
      return;
    }
    const idRegex = /document\.getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    const queryRegex = /document\.querySelector\(\s*['"`]#([^'"`]+)['"`]\s*\)/g;
    
    const ids = new Set<string>();
    let match;
    while ((match = idRegex.exec(debouncedScript)) !== null) {
      ids.add(match[1]);
    }
    while ((match = queryRegex.exec(debouncedScript)) !== null) {
      ids.add(match[1]);
    }
    
    // 만약 감지된 ID가 없고 option 변수가 보이면 기본 ID 지정
    if (ids.size === 0) {
      const hasOption = debouncedScript.includes('option =') || 
                        debouncedScript.includes('option1 =') || 
                        debouncedScript.includes('option2 =') || 
                        debouncedScript.includes('option3 =');
      if (hasOption) {
        ids.add('preview-default-chart');
      }
    }
    
    setDetectedIds(Array.from(ids));
  }, [debouncedScript]);

  // Execute preview script in dynamic <script> tag
  useEffect(() => {
    if (!echartsLoaded || !showPreview || detectedIds.length === 0 || !callbackNameRef.current) return;
    
    let isCancelled = false;
    let scriptElement: HTMLScriptElement | null = null;
    
    // 10ms 단위로 최대 100번(1초) 폴링하며 대상 div가 모두 마운트되었는지 확인 (비동기 마운트 대기)
    let attempts = 0;
    const checkAndRun = () => {
      if (isCancelled) return;
      
      const allAvailable = detectedIds.every(id => document.getElementById(`${id}-preview`));
      if (allAvailable) {
        // Clean up previous ECharts instances on these specific DOMs
        detectedIds.forEach(id => {
          const previewId = `${id}-preview`;
          const dom = document.getElementById(previewId);
          if (dom && (window as any).echarts) {
            try {
              (window as any).echarts.dispose(dom);
            } catch(e) {
              // ignore
            }
          }
        });
        
        scriptElement = document.createElement('script');
        scriptElement.setAttribute('type', 'text/javascript');
        
        // Rewrite original ID targets to -preview counterparts in active sandbox script execution
        let code = debouncedScript;
        detectedIds.forEach(id => {
          const escapedId = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const getElementRegex = new RegExp(`(document\\.getElementById\\(\\s*['"\`])${escapedId}(['"\`]\\s*\\))`, 'g');
          const querySelectorRegex = new RegExp(`(document\\.querySelector\\(\\s*['"\`]#)${escapedId}(['"\`]\\s*\\))`, 'g');
          
          code = code.replace(getElementRegex, `$1${id}-preview$2`);
          code = code.replace(querySelectorRegex, `$1${id}-preview$2`);
        });
        
        const hasEchartsInit = debouncedScript.includes('echarts.init');
        const callbackName = callbackNameRef.current;
        
        if (!hasEchartsInit) {
          let optionVar = 'option';
          if (debouncedScript.includes('option1 =')) optionVar = 'option1';
          else if (debouncedScript.includes('option2 =')) optionVar = 'option2';
          else if (debouncedScript.includes('option3 =')) optionVar = 'option3';
          
          const chartId = `${detectedIds[0] || 'preview-default-chart'}-preview`;
          
          code = `
            (function() {
              var echarts = window.echarts;
              try {
                if (window['${callbackName}']) {
                  window['${callbackName}'](null);
                }
                ${code}
                var chartDom = document.getElementById('${chartId}');
                if (chartDom && echarts) {
                  var myChart = echarts.init(chartDom);
                  myChart.setOption(${optionVar});
                  
                  var resizeObserver = new ResizeObserver(function() {
                    myChart.resize();
                  });
                  resizeObserver.observe(chartDom);
                } else {
                  throw new Error("차트를 그릴 DOM 엘리먼트(" + '${chartId}' + ")를 찾지 못했거나 echarts가 없습니다.");
                }
              } catch (e) {
                console.error('Preview error:', e);
                if (window['${callbackName}']) {
                  window['${callbackName}'](e.message || String(e));
                }
              }
            })();
          `;
        } else {
          code = `
            (function() {
              var echarts = window.echarts;
              try {
                if (window['${callbackName}']) {
                  window['${callbackName}'](null);
                }
                ${code}
              } catch (e) {
                console.error('Preview error:', e);
                if (window['${callbackName}']) {
                  window['${callbackName}'](e.message || String(e));
                }
              }
            })();
          `;
        }
        
        scriptElement.textContent = code;
        document.body.appendChild(scriptElement);
      } else if (attempts < 100) {
        attempts++;
        setTimeout(checkAndRun, 10);
      }
    };
    
    checkAndRun();
    
    return () => {
      isCancelled = true;
      if (scriptElement) {
        try {
          document.body.removeChild(scriptElement);
        } catch (e) {}
      }
    };
  }, [debouncedScript, detectedIds, echartsLoaded, showPreview]);

  return (
    <NodeViewWrapper
      className={`custom-script-node-view ${isSelected ? 'ProseMirror-selectednode' : ''}`}
      style={{
        margin: '2rem 0',
        padding: '1.25rem',
        background: '#1e293b',
        borderRadius: '12px',
        border: isSelected ? '2px solid #f59e0b' : '1px solid #475569',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        color: '#f8fafc',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <BarChart2 size={16} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: '0.85rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 'bold' }}>차트 매크로</span>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ECharts를 사용한 동적 시각화 스크립트</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={(e) => {
              e.preventDefault();
              setShowPreview(!showPreview);
            }}
            style={{
              background: showPreview ? 'rgba(56, 189, 248, 0.1)' : 'rgba(148, 163, 184, 0.1)',
              border: 'none',
              color: showPreview ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
          >
            {showPreview ? '미리보기 접기' : '미리보기 켜기'}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              props.deleteNode();
            }}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontWeight: 'bold',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            title="삭제"
          >
            삭제
          </button>
        </div>
      </div>
      <textarea
        value={scriptContent || ''}
        onChange={handleChange}
        placeholder="//여기에 ECharts 차트 스크립트를 입력하세요."
        style={{
          width: '100%',
          height: '240px',
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '0.8rem',
          fontFamily: 'Consolas, Monaco, ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.85rem',
          lineHeight: '1.6',
          resize: 'vertical',
          outline: 'none',
        }}
      />

      {/* Preview Section */}
      {showPreview && detectedIds.length > 0 && (
        <div style={{ 
          marginTop: '1rem', 
          padding: '1rem', 
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', fontFamily: 'sans-serif' }}>
            차트 실시간 미리보기 {!echartsLoaded && '(ECharts 로딩 중...)'}
          </div>
          {detectedIds.map(id => (
            <div 
              key={id}
              id={`${id}-preview`}
              style={{ 
                width: '100%', 
                height: '350px',
                minHeight: '300px'
              }} 
            />
          ))}
        </div>
      )}
      
      {showPreview && detectedIds.length === 0 && (
        <div style={{
          marginTop: '1rem',
          padding: '1.5rem',
          background: 'rgba(15, 23, 42, 0.3)',
          border: '1px dashed #334155',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '0.85rem',
          fontFamily: 'sans-serif',
          lineHeight: '1.6'
        }}>
          차트 DOM ID를 감지하지 못했습니다. 차트를 그릴 div 태그를 본문에 추가하고,<br />
          스크립트에서 <code>document.getElementById('DOM_ID')</code>를 호출하거나,<br />
          <code>option = &#123; ... &#125;</code> 형식의 변수를 선언하세요.
        </div>
      )}

      {previewError && (
        <div style={{ 
          marginTop: '1rem',
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.2)', 
          color: '#ef4444', 
          padding: '0.6rem 0.8rem', 
          borderRadius: '6px',
          fontSize: '0.8rem',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap'
        }}>
          <strong>[미리보기 에러]</strong> {previewError}
        </div>
      )}
    </NodeViewWrapper>
  );
};

const ScriptExtension = Node.create({
  name: 'script',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      scriptContent: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'script',
        getAttrs: (node: any) => {
          if (node.getAttribute('src')) {
            return false;
          }
          return {
            scriptContent: node.textContent || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { scriptContent } = HTMLAttributes;
    return [
      'script',
      { type: 'script/macro' },
      scriptContent || '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ScriptNodeView);
  },
});

const CustomDiv = Node.create({
  name: 'customDiv',
  group: 'block',
  content: 'block*',
  defining: true,

  addAttributes() {
    return {
      id: { default: null },
      class: { default: null },
      style: { default: null },
      'data-type': { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (node: any) => {
          const dataType = node.getAttribute('data-type');
          if (dataType && ['pdf-viewer', 'link-preview', 'resizable-image', 'image-slide', 'video'].includes(dataType)) {
            return false;
          }
          return {
            id: node.getAttribute('id'),
            class: node.getAttribute('class'),
            style: node.getAttribute('style'),
            'data-type': dataType,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
});

const PdfNodeView = (props: any) => {
  return (
    <NodeViewWrapper className="pdf-node-view">
      <PdfSlideViewer
        url={props.node.attrs.src}
        descriptions={props.node.attrs.descriptions}
        updateAttributes={props.updateAttributes}
        styles={styles}
      />
    </NodeViewWrapper>
  );
};

const PdfExtension = Node.create({
  name: 'pdf',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      descriptions: { default: {} },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="pdf-viewer"]',
        getAttrs: (node: any) => ({
          src: node.getAttribute('data-src'),
          descriptions: JSON.parse(node.getAttribute('data-descriptions') || '{}'),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, descriptions, ...rest } = HTMLAttributes;
    return [
      'div',
      mergeAttributes(rest, {
        'data-type': 'pdf-viewer',
        'data-src': src,
        'data-descriptions': JSON.stringify(descriptions || {}),
      })
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PdfNodeView);
  },
});

const VideoNodeView = (props: any) => {
  const { src, width, textAlign, controls, autoplay, loop, muted } = props.node.attrs;
  const isSelected = props.selected;

  return (
    <NodeViewWrapper
      className={`video-node-view ${isSelected ? 'ProseMirror-selectednode' : ''}`}
      style={{ textAlign, display: 'block', width: '100%', margin: '1.5rem 0' }}
    >
      <div style={{ display: 'inline-block', width, maxWidth: '100%', position: 'relative' }}>
        <video
          src={src}
          controls={controls}
          autoPlay={autoplay}
          loop={loop}
          muted={muted}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '8px',
            boxShadow: isSelected ? '0 0 0 3px #0070f3' : 'none',
            transition: 'box-shadow 0.2s'
          }}
        />
        <div style={{
          display: isSelected ? 'flex' : 'none',
          gap: '10px',
          justifyContent: 'center',
          marginTop: '10px',
          background: 'rgba(0,0,0,0.05)',
          padding: '8px',
          borderRadius: '8px',
          border: '1px solid rgba(0,0,0,0.1)'
        }}>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={controls} onChange={e => props.updateAttributes({ controls: e.target.checked })} /> 컨트롤
          </label>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={autoplay} onChange={e => props.updateAttributes({ autoplay: e.target.checked })} /> 자동재생
          </label>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={loop} onChange={e => props.updateAttributes({ loop: e.target.checked })} /> 반복
          </label>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={muted} onChange={e => props.updateAttributes({ muted: e.target.checked })} /> 음소거
          </label>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

const VideoExtension = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      width: { default: '100%' },
      textAlign: { default: 'center' },
      controls: { default: true },
      autoplay: { default: false },
      loop: { default: false },
      muted: { default: false },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="video"]',
        getAttrs: (node: any) => ({
          src: node.getAttribute('data-src'),
          width: node.getAttribute('data-width') || '100%',
          textAlign: node.getAttribute('data-text-align') || 'center',
          controls: node.getAttribute('data-controls') !== 'false',
          autoplay: node.getAttribute('data-autoplay') === 'true',
          loop: node.getAttribute('data-loop') === 'true',
          muted: node.getAttribute('data-muted') === 'true',
        }),
      },
      {
        tag: 'video',
        getAttrs: (node: any) => ({
          src: node.getAttribute('src'),
          controls: node.hasAttribute('controls'),
          autoplay: node.hasAttribute('autoplay'),
          loop: node.hasAttribute('loop'),
          muted: node.hasAttribute('muted'),
        })
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, width, textAlign, controls, autoplay, loop, muted, ...rest } = HTMLAttributes;
    return [
      'div',
      {
        style: `text-align: ${textAlign}; display: block; width: 100%; margin: 1.5rem 0;`,
        'data-type': 'video',
        'data-src': src,
        'data-width': width,
        'data-text-align': textAlign,
        'data-controls': controls,
        'data-autoplay': autoplay,
        'data-loop': loop,
        'data-muted': muted,
      },
      [
        'video',
        mergeAttributes(rest, {
          src,
          style: 'width: 100%; height: auto; display: block; border-radius: 8px;',
          controls: controls ? '' : null,
          autoplay: autoplay ? '' : null,
          loop: loop ? '' : null,
          muted: muted ? '' : null,
          playsinline: ''
        })
      ]
    ];
  },
});

const IframeExtension = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      srcdoc: { default: null },
      width: { default: '100%' },
      height: { default: '400px' },
      style: { default: 'border: none; overflow: hidden; background: transparent;' },
      allow: { default: null },
      allowfullscreen: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'iframe',
        getAttrs: (node: any) => ({
          src: node.getAttribute('src'),
          srcdoc: node.getAttribute('srcdoc'),
          width: node.getAttribute('width') || '100%',
          height: node.getAttribute('height') || '400px',
          style: node.getAttribute('style') || 'border: none; overflow: hidden; background: transparent;',
          allow: node.getAttribute('allow'),
          allowfullscreen: node.hasAttribute('allowfullscreen') ? '' : null,
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, srcdoc, width, height, style, allow, allowfullscreen, ...rest } = HTMLAttributes;
    return [
      'iframe',
      mergeAttributes(rest, {
        src,
        srcdoc,
        width,
        height,
        style,
        allow,
        allowfullscreen: allowfullscreen ? '' : null,
      }),
    ];
  },
});


const ImageSlideNodeView = (props: any) => {
  const { images } = props.node.attrs;
  const [uploading, setUploading] = useState(false);

  const onAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files as FileList);
      if (files.length === 0) return;

      setUploading(true);
      const newImages = [...(images || [])];

      for (const file of files) {
        let fileToUpload: File | Blob = file;
        try {
          fileToUpload = await compressImage(file);
        } catch (e) {
          console.error('Compression failed', e);
        }

        const formData = new FormData();
        formData.append('file', fileToUpload, file.name);
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (res.ok) {
            const data = await res.json() as UploadResponse;
            if (data.url) {
              newImages.push({ src: data.url, caption: '' });
            }
          }
        } catch (error) {
          console.error('Upload failed', error);
        }
      }

      props.updateAttributes({ images: newImages });
      setUploading(false);
    };
    input.click();
  };

  const onRemoveImage = (index: number) => {
    if (!confirm('현재 이미지를 슬라이드에서 삭제할까요?')) return;
    const newImages = [...images];
    newImages.splice(index, 1);
    props.updateAttributes({ images: newImages });
  };

  const onUpdateCaption = (index: number, caption: string) => {
    const newImages = [...images];
    newImages[index] = { ...newImages[index], caption };
    props.updateAttributes({ images: newImages });
  };

  return (
    <NodeViewWrapper>
      <ImageSlideViewer
        images={images}
        updateAttributes={props.updateAttributes}
        styles={styles}
        onAddImage={onAddImage}
        onRemoveImage={onRemoveImage}
        onUpdateCaption={onUpdateCaption}
      />
      {uploading && (
        <div style={{
          fontSize: '0.8rem',
          textAlign: 'center',
          color: '#0070f3',
          marginTop: '0.5rem',
          fontWeight: '600'
        }}>
          이미지 업로드 중...
        </div>
      )}
    </NodeViewWrapper>
  );
};

const ImageSlideExtension = Node.create({
  name: 'imageSlide',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      images: { default: [] },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-slide"]',
        getAttrs: (node: any) => ({
          images: JSON.parse(node.getAttribute('data-images') || '[]'),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { images, ...rest } = HTMLAttributes;
    return [
      'div',
      mergeAttributes(rest, {
        'data-type': 'image-slide',
        'data-images': JSON.stringify(images || []),
      })
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageSlideNodeView);
  },
});

const ImageNodeView = (props: any) => {
  const { src, width, textAlign, caption } = props.node.attrs;
  const isSelected = props.selected;

  return (
    <NodeViewWrapper
      className={`image-node-view ${isSelected ? 'ProseMirror-selectednode' : ''}`}
      style={{ textAlign, display: 'block', width: '100%', margin: '1.5rem 0' }}
    >
      <div style={{ display: 'inline-block', width, maxWidth: '100%', position: 'relative' }}>
        <img
          src={src}
          alt={caption}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '8px',
            boxShadow: isSelected ? '0 0 0 3px #0070f3' : 'none',
            transition: 'box-shadow 0.2s'
          }}
        />
        <input
          type="text"
          placeholder="이미지 설명을 입력하세요..."
          value={caption || ''}
          onChange={e => props.updateAttributes({ caption: e.target.value })}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // 엔터 입력 시 에디터로 포커스 이동 (가정)
            }
          }}
          style={{
            width: '100%',
            marginTop: '0.6rem',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            display: isSelected || caption ? 'block' : 'none'
          }}
        />
      </div>
    </NodeViewWrapper>
  );
};

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('width') || element.style.width,
        renderHTML: (attributes) => ({
          width: attributes.width,
        }),
      },
      textAlign: {
        default: 'center',
        parseHTML: element => element.style.textAlign || element.parentElement?.style.textAlign || 'center',
        renderHTML: attributes => ({
          textAlign: attributes.textAlign,
        }),
      },
      caption: {
        default: '',
        parseHTML: element => element.getAttribute('data-caption') || '',
        renderHTML: attributes => ({
          'data-caption': attributes.caption,
        }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const { textAlign, width, src, caption, ...rest } = HTMLAttributes;
    return [
      'div',
      {
        style: `text-align: ${textAlign}; display: block; width: 100%; margin: 1.5rem 0;`,
        'data-type': 'resizable-image',
        'data-caption': caption
      },
      [
        'div',
        { style: `display: inline-block; width: ${width}; max-width: 100%;` },
        ['img', mergeAttributes(rest, { src, style: 'width: 100%; height: auto; display: block; border-radius: 8px;' })],
        caption ? ['div', {
          class: 'image-caption',
          style: 'text-align: center; font-size: 0.875rem; color: #666; font-style: italic; margin-top: 0.5rem;'
        }, caption] : ''
      ]
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

const CommandsList = (props: any) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectItem(selectedIndex);
        return true;
      }
      return false;
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [selectedIndex, props.items, props.command]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  return (
    <div className={styles.slashMenu}>
      {props.items.length > 0 ? (
        props.items.map((item: any, index: number) => (
          <button
            key={index}
            className={`${styles.slashMenuItem} ${index === selectedIndex ? styles.slashMenuItemSelected : ''}`}
            onClick={() => selectItem(index)}
          >
            <div className={styles.slashMenuItemTitle}>
              {item.icon}
              {item.title}
            </div>
            <div className={styles.slashMenuItemDescription}>{item.description}</div>
          </button>
        ))
      ) : (
        <div className={styles.slashMenuItem}>결과 없음</div>
      )}
    </div>
  );
};

const SlashCommand = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

const getSuggestionItems = ({ query }: { query: string }) => {
  return [
    {
      title: '코드 블럭',
      description: '코드를 하이라이트와 함께 작성합니다.',
      icon: <Code size={18} />,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: '인용글',
      description: '중요한 문구를 강조합니다.',
      icon: <Quote size={18} />,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: '이미지 슬라이드',
      description: '여러 이미지를 넘겨볼 수 있는 슬라이드를 추가합니다.',
      icon: <ImageIcon size={18} />,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).insertContent({ type: 'imageSlide' }).run();
      },
    },
    {
      title: '차트 매크로 (ECharts)',
      description: 'ECharts 스크립트를 작성하여 차트를 동적으로 렌더링합니다.',
      icon: <BarChart2 size={18} />,
      command: ({ editor, range }: any) => {
        const chartId = 'chart_' + Math.random().toString(36).substring(2, 9);
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'script',
          attrs: {
            scriptContent: `// ECharts 옵션을 작성하세요.\nvar ${chartId}Dom = document.getElementById('${chartId}');\nvar ${chartId}Chart = echarts.init(${chartId}Dom);\nvar ${chartId}Option = {\n  title: { text: '새 차트', left: 'center' },\n  tooltip: { trigger: 'axis' },\n  xAxis: { data: ['A', 'B', 'C'] },\n  yAxis: {},\n  series: [{ name: '수량', type: 'bar', data: [10, 20, 30] }]\n};\n${chartId}Chart.setOption(${chartId}Option);`
          }
        }).run();
      },
    },
    {
      title: '글 스타일 지정 (CSS)',
      description: '이 글에만 적용될 커스텀 CSS 스타일을 작성합니다.',
      icon: <Palette size={18} />,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'customCss',
          attrs: { cssContent: '/* 여기에 CSS 코드를 입력하세요. 예: body { background: #f8f9fa; } */' }
        }).run();
      },
    },
  ].filter(item =>
    item.title.toLowerCase().startsWith(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase())
  );
};

const shouldShowSmartLink = ({ editor, state }: { editor: any, state: any }) => {
  const { selection } = state;
  const { $from, empty } = selection;
  if (!empty) return false;

  const isLink = editor.isActive('link');
  if (!isLink) return false;

  // If it's already a linkPreview, don't show the Smart Link button
  if (editor.isActive('linkPreview')) return false;

  // Get the text of the link at the current position
  const markType = state.schema.marks.link;
  let linkText = '';
  state.doc.nodesBetween($from.start(), $from.end(), (node: any, pos: number) => {
    const mark = node.marks.find((m: any) => m.type === markType);
    if (mark && pos <= $from.pos && pos + node.nodeSize >= $from.pos) {
      linkText = node.text || '';
      return false;
    }
  });

  const urlRegex = /^(https?:\/\/[^\s]+)$/;
  if (!urlRegex.test(linkText.trim())) return false;

  // Only show if it's a plain paragraph or heading (not already a linkPreview node)
  return editor.isActive('paragraph') || editor.isActive('heading');
};

const ColorPicker = ({ editor }: { editor: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const colors = [
    { name: '기본값', value: '' },
    { name: '빨강', value: '#ef4444' },
    { name: '파랑', value: '#3b82f6' },
    { name: '초록', value: '#10b981' },
    { name: '주황', value: '#f97316' },
    { name: '보라', value: '#8b5cf6' },
    { name: '노랑', value: '#eab308' },
    { name: '회색', value: '#64748b' }
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as any)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorSelect = (color: string) => {
    if (color) {
      // @ts-ignore
      editor.chain().focus().setColor(color).run();
    } else {
      // @ts-ignore
      editor.chain().focus().unsetColor().run();
    }
    setIsOpen(false);
  };

  const activeColor = editor?.getAttributes('textColor')?.color || '';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={styles.toolbarButton}
        style={{
          color: activeColor || 'inherit',
          fontWeight: 'bold',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          width: '32px',
          height: '32px',
          padding: 0
        }}
        title="글자 색상"
      >
        <span style={{ fontSize: '14px', lineHeight: 1 }}>A</span>
        <span style={{
          width: '16px',
          height: '3px',
          backgroundColor: activeColor || '#cbd5e1',
          display: 'block',
          borderRadius: '1px'
        }} />
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '6px',
          zIndex: 1000,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          whiteSpace: 'nowrap'
        }}>
          {colors.map((c) => (
            <button
              type="button"
              key={c.name}
              onClick={() => handleColorSelect(c.value)}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: c.value || '#e2e8f0',
                border: activeColor === c.value ? '2px solid #0070f3' : '1px solid #cbd5e1',
                cursor: 'pointer',
                padding: 0,
                position: 'relative',
                boxSizing: 'border-box'
              }}
              title={c.name}
            >
              {!c.value && (
                <span style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-45deg)',
                  width: '100%',
                  height: '1px',
                  backgroundColor: '#ef4444'
                }} />
              )}
            </button>
          ))}
          <div style={{ width: '1px', height: '16px', backgroundColor: '#e2e8f0', margin: '0 2px' }} />
          <input
            type="color"
            value={activeColor && activeColor.startsWith('#') ? activeColor : '#000000'}
            onChange={(e) => handleColorSelect(e.target.value)}
            style={{
              width: '18px',
              height: '18px',
              padding: 0,
              border: 'none',
              cursor: 'pointer',
              background: 'none',
              boxSizing: 'border-box'
            }}
            title="사용자 지정 색상"
          />
        </div>
      )}
    </div>
  );
};

export function EditorInner() {
  const [title, setTitle] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [status, setStatus] = useState('published');
  const [publishedAt, setPublishedAt] = useState(''); // New for scheduled publishing
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [isWordWrap, setIsWordWrap] = useState(true);
  const [showBulkSeoModal, setShowBulkSeoModal] = useState(false);

  const handleApplyBulkSeo = (data: BulkSeoParsedData & { applyToTitle: boolean }) => {
    if (data.slug) setSlug(data.slug);
    if (data.metaTitle) {
      setMetaTitle(data.metaTitle);
      if (data.applyToTitle && (!title || title.trim() === '')) {
        setTitle(data.metaTitle);
      }
    }
    if (data.metaDescription) setMetaDescription(data.metaDescription);
    if (data.metaKeywords) setMetaKeywords(data.metaKeywords);
    if (data.ogTitle) setOgTitle(data.ogTitle);
    if (data.ogDescription) setOgDescription(data.ogDescription);
    if (data.thumbnailAlt) {
      const currentHtml = showHtml ? htmlContent : editor?.getHTML() || '';
      const doc = new DOMParser().parseFromString(currentHtml, 'text/html');
      const firstImage = doc.querySelector('img');
      if (firstImage && !firstImage.getAttribute('alt')?.trim()) {
        firstImage.setAttribute('alt', data.thumbnailAlt);
        const updated = doc.body.innerHTML;
        if (showHtml) setHtmlContent(updated);
        else editor?.commands.setContent(updated);
      }
    }
  };

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);


  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: {},
        blockquote: {},
        heading: false, // Disable default to use custom
        paragraph: false, // Disable default to use custom
        strike: false, // Explicitly added below
        bulletList: false, // Explicitly added below
        orderedList: false, // Explicitly added via CustomOrderedList below
        // @ts-ignore
        link: false, // Explicitly added below
        // @ts-ignore
        underline: false, // Explicitly added below
      }),
      // @ts-ignore
      CustomHeading,
      // @ts-ignore
      CustomParagraph,
      // @ts-ignore
      CustomHighlight,
      // @ts-ignore
      TextColor,
      Underline,
      Strike,
      // @ts-ignore
      CustomBulletList,
      // @ts-ignore
      CustomOrderedList,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      ResizableImage,
      PdfExtension,
      ImageSlideExtension,
      LinkPreviewExtension,
      CustomCssExtension,
      ScriptExtension,
      CustomDiv,
      VideoExtension,
      IframeExtension,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      BubbleMenuExtension.configure({
        pluginKey: 'smartLinkMenu',
        shouldShow: shouldShowSmartLink,
      }),
      BubbleMenuExtension.configure({
        pluginKey: 'bubbleMenu',
        shouldShow: ({ editor, state }) => {
          return !state.selection.empty && (editor.isActive('paragraph') || editor.isActive('heading'));
        },
      }),
      Mention.configure({
        HTMLAttributes: { class: 'hashtag' },
        renderText({ node }) { return `#${node.attrs.label ?? node.attrs.id}`; },
        renderHTML({ node }) {
          return [
            'span',
            {
              'data-type': 'mention',
              'data-id': node.attrs.id,
              'data-label': node.attrs.label ?? node.attrs.id,
              class: 'hashtag',
            },
            `#${node.attrs.label ?? node.attrs.id}`,
          ]
        },
        suggestion: {
          char: '#',
          command: ({ editor, range, props }) => {
            editor.chain().focus().insertContentAt(range, [
              { type: 'mention', attrs: props },
              { type: 'text', text: ' ' },
            ]).run();
            window.getSelection()?.collapseToEnd();
          },
        },
      }),
      SlashCommand.configure({
        suggestion: {
          items: getSuggestionItems,
          render: () => {
            let component: any;
            let popup: any;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(CommandsList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                const rect = props.clientRect();
                if (!rect) return;

                popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.zIndex = '1000';
                popup.style.top = `${rect.bottom + 5}px`;
                popup.style.left = `${rect.left}px`;
                popup.appendChild(component.element);
                document.body.appendChild(popup);
              },
              onUpdate(props: any) {
                component.updateProps(props);

                if (!props.clientRect) {
                  return;
                }

                const rect = props.clientRect();
                if (rect && popup) {
                  popup.style.top = `${rect.bottom + 5}px`;
                  popup.style.left = `${rect.left}px`;
                }
              },
              onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                  if (popup) {
                    popup.remove();
                    popup = null;
                  }
                  return true;
                }
                return false;
              },
              onExit() {
                if (popup) {
                  popup.remove();
                  popup = null;
                }
                component.destroy();
              },
            };
          },
        },
      }),
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData('text/html');
        // 브라우저에서 이미지를 복사한 경우(HTML에 img 태그가 포함됨)
        // 이때는 Tiptap의 기본 동작(이미지 태그 삽입)을 허용하여 원본 URL(GIF 등)을 유지하도록 함
        if (html && /<img/i.test(html)) {
          return false;
        }

        const text = event.clipboardData?.getData('text/plain');
        const urlRegex = /^(https?:\/\/[^\s]+)$/;
        const match = text?.trim().match(urlRegex);

        if (match) {
          const url = match[1];
          // URL만 붙여넣기 할 때 OG 데이터를 가져와서 배너를 생성
          fetchOgData(url).then(result => {
            if (result.success && result.data) {
              editor?.chain().focus().insertContent({
                type: 'linkPreview',
                attrs: result.data
              }).run();
            } else {
              // 실패 시 일반 링크로 삽입
              editor?.chain().focus().setLink({ href: url }).insertContent(url).run();
            }
          });
          return true;
        }

        const items = Array.from(event.clipboardData?.items || []);
        const files = items
          .filter(item => item.type.startsWith('image'))
          .map(item => item.getAsFile())
          .filter((file): file is File => file !== null);

        if (files.length > 0) {
          event.preventDefault();
          uploadAndInsertMultipleImages(files);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    // Load ECharts dynamically in the editor environment
    import('echarts').then((echarts) => {
      (window as any).echarts = wrapEcharts(echarts);
    }).catch(err => {
      console.error('Failed to load ECharts in editor:', err);
    });
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      const cats = await getCategories();
      setCategories(cats);

      if (editId && editor) {
        try {
          const post = await getPost(parseInt(editId));
          if (post) {
            setTitle(post.title || '');
            setThumbnailUrl(post.thumbnail_url || '');
            setSlug(post.slug || '');
            setMetaTitle(post.meta_title || '');
            setMetaDescription(post.meta_description || '');
            setMetaKeywords(post.meta_keywords || '');
            setOgTitle(post.og_title || '');
            setOgDescription(post.og_description || '');
            setStatus(post.status || 'published');
            setCategoryId(post.category_id || null);

            // Set publishedAt for date picker (YYYY-MM-DDTHH:MM)
            if (post.published_at) {
              try {
                const date = new Date(post.published_at);
                if (!isNaN(date.getTime())) {
                  // Adjust for local timezone
                  const offset = date.getTimezoneOffset() * 60000;
                  const localISODate = new Date(date.getTime() - offset).toISOString().slice(0, 16);
                  setPublishedAt(localISODate);
                }
              } catch (e) {
                console.error('Failed to parse published_at:', e);
              }
            } else {
              setPublishedAt('');
            }

            if (post.content) {
              editor.commands.setContent(post.content);
            }
          }
        } catch (error) {
          console.error('Failed to fetch post:', error);
          alert('글을 불러오는 중 오류가 발생했습니다.');
        }
      }
    };
    fetchInitialData();
  }, [editId, editor]);

  const uploadAndInsertMultipleImages = async (files: File[]) => {
    setUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        let fileToUpload: File | Blob = file;
        if (file.type.startsWith('image/')) {
          try {
            fileToUpload = await compressImage(file);
          } catch (e) {
            console.error('Compression failed', e);
          }
        }

        // 실제 마임타입에 맞춰 확장자 보정
        let fileName = file.name;
        const mimeType = fileToUpload.type;
        const extensionMap: { [key: string]: string } = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
        };

        const newExt = extensionMap[mimeType];
        if (newExt) {
          const currentExt = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
          if (currentExt !== newExt && !(newExt === '.jpg' && currentExt === '.jpeg')) {
            const baseName = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
            fileName = baseName + newExt;
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload, fileName);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) return null;
        return await res.json() as UploadResponse;
      });

      const results = await Promise.all(uploadPromises);
      let chain = editor?.chain().focus();
      results.forEach(data => {
        if (data && data.url) {
          // @ts-ignore
          chain = chain?.setImage({ src: data.url, width: '100%', textAlign: 'center' });
        }
      });
      chain?.run();
    } catch (error) {
      alert('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const uploadAndInsertImage = async (file: File) => {
    setUploading(true);
    try {
      let fileToUpload: File | Blob = file;
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await compressImage(file);
        } catch (e) {
          console.error('Compression failed', e);
        }
      }

      // 실제 마임타입에 맞춰 확장자 보정
      let fileName = file.name;
      const mimeType = fileToUpload.type;
      const extensionMap: { [key: string]: string } = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };

      const newExt = extensionMap[mimeType];
      if (newExt) {
        const currentExt = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
        if (currentExt !== newExt && !(newExt === '.jpg' && currentExt === '.jpeg')) {
          const baseName = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
          fileName = baseName + newExt;
        }
      }

      const formData = new FormData();
      formData.append('file', fileToUpload, fileName);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('업로드 실패');
      const data = await res.json() as UploadResponse;
      if (data.url) {
        // @ts-ignore
        editor?.chain().focus().setImage({ src: data.url, width: '100%', textAlign: 'center' }).run();
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.includes('pdf')) {
      alert('PDF 파일만 업로드 가능합니다.');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('PDF 업로드 실패');
      const data = await res.json() as UploadResponse;
      if (data.url) {
        editor?.chain().focus().insertContent({ type: 'pdf', attrs: { src: data.url } }).run();
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('video/')) {
      alert('동영상 파일만 업로드 가능합니다.');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('동영상 업로드 실패');
      const data = await res.json() as UploadResponse;
      if (data.url) {
        editor?.chain().focus().insertContent({ type: 'video', attrs: { src: data.url } }).run();
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isThumbnail: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isThumbnail) {
      setUploading(true);
      try {
        let fileToUpload: File | Blob = file;
        if (file.type.startsWith('image/')) {
          try {
            fileToUpload = await compressImage(file);
          } catch (e) {
            console.error('Compression failed', e);
          }
        }

        // 실제 마임타입에 맞춰 확장자 보정
        let fileName = file.name;
        const mimeType = fileToUpload.type;
        const extensionMap: { [key: string]: string } = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
        };

        const newExt = extensionMap[mimeType];
        if (newExt) {
          const currentExt = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
          if (currentExt !== newExt && !(newExt === '.jpg' && currentExt === '.jpeg')) {
            const baseName = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
            fileName = baseName + newExt;
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload, fileName);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json() as UploadResponse;
        if (data.url) setThumbnailUrl(data.url);
      } catch (error) {
        alert('썸네일 업로드 실패');
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    } else {
      uploadAndInsertImage(file);
      e.target.value = '';
    }
  };

  const handleHtmlImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const htmlText = event.target?.result as string;
      if (!htmlText) return;

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        // Extract content inside body (or fall back to full htmlText if no body)
        const bodyContent = doc.body?.innerHTML || htmlText;

        if (editor) {
          const replaceAll = window.confirm(
            '가져온 HTML 문서로 현재 편집기 전체 내용을 덮어씌우시겠습니까?\n("취소"를 누르면 현재 커서 위치에 삽입됩니다.)'
          );
          if (replaceAll) {
            editor.commands.setContent(bodyContent);
          } else {
            editor.commands.insertContent(bodyContent);
          }
        }
      } catch (err) {
        console.error('HTML 파싱 오류:', err);
        alert('HTML 파일을 파싱하는 데 실패했습니다.');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const formatSource = () => {
    if (!htmlContent) return;
    const formatted = beautify.html(htmlContent, {
      indent_size: 2,
      indent_char: ' ',
      max_preserve_newlines: 1,
      preserve_newlines: true,
      indent_inner_html: true,
      wrap_line_length: 0,
      unformatted: ['code', 'pre', 'em', 'strong'],
      extra_liners: [],
    });
    setHtmlContent(formatted);
  };

  const toggleHtmlView = () => {
    if (showHtml) {
      const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
      const h1Text = doc.querySelector('h1')?.textContent?.trim();
      if (h1Text) setTitle(h1Text);
      editor?.commands.setContent(htmlContent);
    } else {
      const rawHtml = editor?.getHTML() || '';
      const formattedHtml = beautify.html(rawHtml, {
        indent_size: 2,
        indent_char: ' ',
        max_preserve_newlines: 1,
        preserve_newlines: true,
        indent_inner_html: true,
        wrap_line_length: 0,
        unformatted: ['code', 'pre', 'em', 'strong'],
        extra_liners: [],
      });
      setHtmlContent(formattedHtml);
    }
    setShowHtml(!showHtml);
  };

  const clearStylesAggressive = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    editor.chain().focus().insertContent(text).run();
  };

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL을 입력하세요', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleSave = async (targetStatus?: string) => {
    if (!title || !editor) return;
    setSaving(true);
    let html = showHtml ? htmlContent : editor.getHTML();
    if (!showHtml) {
      const complexRegex = /(<(code|pre|span)[^>]*>.*?<\/\2>|<[^>]+>)|((?<=^|\s|>|&nbsp;)#([\w\uac00-\ud7af]+)(?=\s|<|$|&nbsp;))/g;
      html = html.replace(complexRegex, (match, tag, tagName, hashtag, word) => {
        if (tag) {
          if (tagName === 'span' && tag.includes('class="hashtag"')) {
            const textMatch = tag.match(/>#([^<]+)<\/span>/);
            if (textMatch) {
              const currentWord = textMatch[1];
              return `<span data-type="mention" data-id="${currentWord}" data-label="${currentWord}" class="hashtag">#${currentWord}</span>`;
            }
          }
          return tag;
        }
        if (hashtag) return `<span data-type="mention" data-id="${word}" data-label="${word}" class="hashtag">#${word}</span>`;
        return match;
      });
    }
    const finalStatus = targetStatus || status;
    const postData = {
      title,
      content: html,
      thumbnailUrl,
      slug,
      metaTitle,
      metaDescription,
      metaKeywords,
      ogTitle,
      ogDescription,
      status: finalStatus,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      categoryId
    };
    let result;
    if (editId) result = await updatePost(parseInt(editId), postData);
    else result = await savePost(postData);
    if (result.success) {
      alert(editId ? '수정되었습니다!' : (finalStatus === 'draft' ? '임시 저장되었습니다!' : '발행되었습니다!'));
      setStatus(finalStatus);

      if (finalStatus === 'published') {
        router.push('/admin/posts');
      } else if (!editId && 'id' in result && result.id) {
        // 새 글을 처음 임시저장했을 때는 ID가 포함된 편집 URL로 변경하여 상태 유지
        router.replace(`/admin/editor?id=${result.id}`);
      }
    } else alert(result.error);
    setSaving(false);
  };

  const convertToSmartLink = () => {
    if (!editor) return;
    const { href } = editor.getAttributes('link');
    if (!href) return;

    const { state } = editor;
    const { selection } = state;
    const { $from } = selection;

    // Find the full link range
    const markType = state.schema.marks.link;
    const start = $from.before();
    const end = $from.after();
    let linkRange: { from: number, to: number } | null = null;

    state.doc.nodesBetween($from.start(), $from.end(), (node: any, pos: number) => {
      const mark = node.marks.find((m: any) => m.type === markType);
      if (mark && pos <= $from.pos && pos + node.nodeSize >= $from.pos) {
        linkRange = { from: pos, to: pos + node.nodeSize };
        return false;
      }
    });

    if (linkRange) {
      setUploading(true);
      fetchOgData(href).then(result => {
        if (result.success && result.data && editor) {
          editor.chain().focus()
            // @ts-ignore
            .deleteRange(linkRange)
            .insertContent({
              type: 'linkPreview',
              attrs: result.data
            })
            .run();
        } else {
          alert('OG 데이터를 가져오는데 실패했습니다.');
        }
        setUploading(false);
      });
    }
  };

  if (!editor) return null;

  return (
    <div className={styles.editorWrapper}>
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey="smartLinkMenu"
          shouldShow={shouldShowSmartLink}
          // @ts-ignore
          tippyOptions={{
            placement: 'right',
            offset: [0, 10],
            duration: [200, 0],
            animation: 'shift-away'
          }}
        >
          <button
            className={styles.smartLinkFloatingBtn}
            onClick={convertToSmartLink}
            title="미리보기 카드로 변환"
          >
            <Zap size={12} fill="currentColor" /> Smart Link
          </button>
        </BubbleMenu>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <Link href="/admin/posts" className={adminStyles.editLink}>← 게시글 관리로 돌아가기</Link>
      </div>
      <input type="text" placeholder="제목을 입력하세요" className={styles.titleInput} value={title} onChange={(e) => setTitle(e.target.value)} />

      <div style={{ marginBottom: '1rem' }}>
        <select
          className={styles.seoInput}
          style={{ width: '100%', marginBottom: '1rem' }}
          value={categoryId || ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">카테고리 선택 없음</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input type="text" placeholder="썸네일 이미지 URL 또는 파일 업로드" className={styles.thumbnailInput} style={{ marginBottom: 0, flexGrow: 1 }} value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
        <button onClick={() => thumbnailInputRef.current?.click()} className={`${styles.toolbarButton} ${styles.imageUploadBtn}`} disabled={uploading}>{uploading ? '업로드 중...' : '📷 이미지 업로드'}</button>
        <input type="file" ref={thumbnailInputRef} hidden accept="image/*" onChange={(e) => handleFileUpload(e, true)} />
      </div>
      <div className={styles.editorToolbar}>
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={`${styles.toolbarButton} ${editor.isActive('bold') ? styles.toolbarButtonActive : ''}`} disabled={showHtml} title="굵게"><Bold size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`${styles.toolbarButton} ${editor.isActive('italic') ? styles.toolbarButtonActive : ''}`} disabled={showHtml} title="기울기"><Italic size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`${styles.toolbarButton} ${editor.isActive('underline') ? styles.toolbarButtonActive : ''}`} disabled={showHtml} title="밑줄"><UnderlineIcon size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`${styles.toolbarButton} ${editor.isActive('strike') ? styles.toolbarButtonActive : ''}`} disabled={showHtml} title="취소선"><Strikethrough size={16} /></button>
        {!showHtml && <ColorPicker editor={editor} />}

        <span className={styles.toolbarDivider}></span>

        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`${styles.toolbarButton} ${editor.isActive('bulletList') ? styles.toolbarButtonActive : ''}`} disabled={showHtml} title="글머리 기호"><List size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`${styles.toolbarButton} ${editor.isActive('orderedList', { type: '1' }) ? styles.toolbarButtonActive : ''}`} disabled={showHtml} title="번호 매기기 (1, 2, 3)"><ListOrdered size={16} /></button>
        <button
          // @ts-ignore
          onClick={() => editor.chain().focus().toggleMark('highlight').run()}
          className={`${styles.toolbarButton} ${editor.isActive('highlight') ? styles.toolbarButtonActive : ''}`}
          disabled={showHtml}
          title="형광펜"
        >
          <Highlighter size={16} />
        </button>

        <span className={styles.toolbarDivider}></span>

        <button onClick={() => editor.chain().focus().updateAttributes('heading', { textAlign: 'left' }).updateAttributes('paragraph', { textAlign: 'left' }).run()} className={styles.toolbarButton} disabled={showHtml} title="왼쪽 정렬"><AlignLeft size={16} /></button>
        <button onClick={() => editor.chain().focus().updateAttributes('heading', { textAlign: 'center' }).updateAttributes('paragraph', { textAlign: 'center' }).run()} className={styles.toolbarButton} disabled={showHtml} title="가운데 정렬"><AlignCenter size={16} /></button>
        <button onClick={() => editor.chain().focus().updateAttributes('heading', { textAlign: 'right' }).updateAttributes('paragraph', { textAlign: 'right' }).run()} className={styles.toolbarButton} disabled={showHtml} title="오른쪽 정렬"><AlignRight size={16} /></button>

        <span className={styles.toolbarDivider}></span>

        <button onClick={clearStylesAggressive} className={styles.toolbarButton} title="모든 스타일 제거" disabled={showHtml}>🧹 스타일 제거</button>
        <button onClick={toggleHtmlView} className={`${styles.toolbarButton} ${showHtml ? styles.toolbarButtonActive : ''}`} title="HTML 소스 보기">{showHtml ? '📝 에디터 보기' : '<> 소스 보기'}</button>
        {showHtml && (
          <>
            <button onClick={formatSource} className={styles.toolbarButton} title="HTML 정렬">✨ 코드 정렬</button>
            <button 
              onClick={() => setIsWordWrap(!isWordWrap)} 
              className={`${styles.toolbarButton} ${isWordWrap ? styles.toolbarButtonActive : ''}`} 
              title="줄 바꿈 토글"
            >
              📄 줄 바꿈 {isWordWrap ? 'ON' : 'OFF'}
            </button>
          </>
        )}
        <button onClick={() => inlineImageInputRef.current?.click()} className={styles.toolbarButton} disabled={uploading || showHtml}>{uploading ? '...' : 'Img'}</button>
        <button onClick={() => pdfInputRef.current?.click()} className={styles.toolbarButton} disabled={uploading || showHtml} title="PDF 파일 업로드">{uploading ? '...' : 'PDF'}</button>
        <button onClick={() => videoInputRef.current?.click()} className={styles.toolbarButton} disabled={uploading || showHtml} title="동영상 파일 업로드">{uploading ? '...' : <Video size={16} />}</button>
        <button onClick={() => htmlInputRef.current?.click()} className={styles.toolbarButton} disabled={uploading || showHtml} title="HTML 파일 가져오기">HTML</button>
        <input type="file" ref={inlineImageInputRef} hidden accept="image/*" onChange={(e) => handleFileUpload(e, false)} />
        <input type="file" ref={pdfInputRef} hidden accept="application/pdf" onChange={handlePdfUpload} />
        <input type="file" ref={videoInputRef} hidden accept="video/*" onChange={handleVideoUpload} />
        <input type="file" ref={htmlInputRef} hidden accept=".html,.htm" onChange={handleHtmlImport} />
      </div>
      <div className={`${styles.editorContent} ${showHtml ? styles.sourceViewActive : ''}`}>
        {showHtml ? (
          <div className={styles.sourceEditorContainer}>
            <CodeMirror
              value={htmlContent}
              height="700px"
              theme="dark"
              extensions={isWordWrap ? [html(), EditorView.lineWrapping] : [html()]}
              onChange={(value) => {
                setHtmlContent(value);
                const doc = new DOMParser().parseFromString(value, 'text/html');
                const h1Text = doc.querySelector('h1')?.textContent?.trim();
                if (h1Text) setTitle(h1Text);
              }}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                foldGutter: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                syntaxHighlighting: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
              }}
            />
          </div>
        ) : (
          <>
            {editor && (
              <>
                <BubbleMenu
                  className={styles.bubbleMenuContainer}
                  editor={editor}
                  pluginKey="bubbleMenu"
                  shouldShow={({ editor, state }) => {
                    return !state.selection.empty && !editor.isActive('image') && !editor.isActive('linkPreview') && (editor.isActive('paragraph') || editor.isActive('heading'));
                  }}
                  // @ts-ignore
                  tippyOptions={{ offset: [200, 80], duration: 100, placement: 'top' }}
                >
                  <div className={styles.bubbleMenu}>
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`${styles.bubbleButton} ${editor.isActive('heading', { level: 2 }) ? styles.bubbleButtonActive : ''}`}>H2</button>
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`${styles.bubbleButton} ${editor.isActive('heading', { level: 3 }) ? styles.bubbleButtonActive : ''}`}>H3</button>
                    <button onClick={() => editor.chain().focus().setParagraph().run()} className={`${styles.bubbleButton} ${editor.isActive('paragraph') ? styles.bubbleButtonActive : ''}`}>P</button>

                    <button
                      // @ts-ignore
                      onClick={() => editor.chain().focus().toggleMark('highlight').run()}
                      className={`${styles.bubbleButton} ${editor.isActive('highlight') ? styles.bubbleButtonActive : ''}`}
                      title="형광펜"
                    >
                      <Highlighter size={14} />
                    </button>

                    <span className={styles.bubbleDivider}></span>
                    <button onClick={() => editor.chain().focus().updateAttributes('heading', { textAlign: 'left' }).updateAttributes('paragraph', { textAlign: 'left' }).run()} className={styles.bubbleButton} title="왼쪽 정렬"><AlignLeft size={16} /></button>
                    <button onClick={() => editor.chain().focus().updateAttributes('heading', { textAlign: 'center' }).updateAttributes('paragraph', { textAlign: 'center' }).run()} className={styles.bubbleButton} title="가운데 정렬"><AlignCenter size={16} /></button>
                    <button onClick={() => editor.chain().focus().updateAttributes('heading', { textAlign: 'right' }).updateAttributes('paragraph', { textAlign: 'right' }).run()} className={styles.bubbleButton} title="오른쪽 정렬"><AlignRight size={16} /></button>
                    <span className={styles.bubbleDivider}></span>

                    <button onClick={setLink} className={`${styles.bubbleButton} ${editor.isActive('link') ? styles.bubbleButtonActive : ''}`} title="링크 추가/수정">🔗</button>
                    {editor.isActive('link') && (
                      <button onClick={() => editor.chain().focus().unsetLink().run()} className={styles.bubbleButton} title="링크 제거">🚫</button>
                    )}
                    <span className={styles.bubbleDivider}></span>
                    <button onClick={() => editor.chain().focus().toggleBold().run()} className={`${styles.bubbleButton} ${editor.isActive('bold') ? styles.bubbleButtonActive : ''}`} title="굵게"><Bold size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`${styles.bubbleButton} ${editor.isActive('italic') ? styles.bubbleButtonActive : ''}`} title="기울기"><Italic size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`${styles.bubbleButton} ${editor.isActive('underline') ? styles.bubbleButtonActive : ''}`} title="밑줄"><UnderlineIcon size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`${styles.bubbleButton} ${editor.isActive('strike') ? styles.bubbleButtonActive : ''}`} title="취소선"><Strikethrough size={14} /></button>
                    <ColorPicker editor={editor} />
                    <span className={styles.bubbleDivider}></span>
                    <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`${styles.bubbleButton} ${editor.isActive('bulletList') ? styles.bubbleButtonActive : ''}`} title="글머리 기호"><List size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`${styles.bubbleButton} ${editor.isActive('orderedList') ? styles.bubbleButtonActive : ''}`} title="번호 매기기"><ListOrdered size={14} /></button>
                    <span className={styles.bubbleDivider}></span>

                    <button onClick={clearStylesAggressive} className={styles.bubbleButton} title="스타일 제거">🧹</button>
                  </div>
                </BubbleMenu>
                <BubbleMenu
                  className={styles.bubbleMenuContainer}
                  editor={editor}
                  shouldShow={({ editor }) => editor.isActive('image')}
                  pluginKey="imageBubbleMenu"
                  // @ts-ignore
                  tippyOptions={{ offset: [200, 80], duration: 100, placement: 'top' }}
                >
                  <div className={styles.bubbleMenu}>
                    <button onClick={() => editor.chain().focus().updateAttributes('image', { width: '25%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('image', { width: '25%' }) ? styles.bubbleButtonActive : ''}`}>25%</button>
                    <button onClick={() => editor.chain().focus().updateAttributes('image', { width: '50%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('image', { width: '50%' }) ? styles.bubbleButtonActive : ''}`}>50%</button>
                    <button onClick={() => editor.chain().focus().updateAttributes('image', { width: '75%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('image', { width: '75%' }) ? styles.bubbleButtonActive : ''}`}>75%</button>
                    <button onClick={() => editor.chain().focus().updateAttributes('image', { width: '100%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('image', { width: '100%' }) ? styles.bubbleButtonActive : ''}`}>100%</button>

                    <span className={styles.bubbleDivider}></span>
                    <button
                      onClick={() => editor.chain().focus().updateAttributes('image', { textAlign: 'left' }).run()}
                      className={`${styles.bubbleButton} ${editor.isActive('image', { textAlign: 'left' }) ? styles.bubbleButtonActive : ''}`}
                      title="왼쪽 정렬"
                    >
                      <AlignLeft size={16} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().updateAttributes('image', { textAlign: 'center' }).run()}
                      className={`${styles.bubbleButton} ${editor.isActive('image', { textAlign: 'center' }) ? styles.bubbleButtonActive : ''}`}
                      title="가운데 정렬"
                    >
                      <AlignCenter size={16} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().updateAttributes('image', { textAlign: 'right' }).run()}
                      className={`${styles.bubbleButton} ${editor.isActive('image', { textAlign: 'right' }) ? styles.bubbleButtonActive : ''}`}
                      title="오른쪽 정렬"
                    >
                      <AlignRight size={16} />
                    </button>
                  </div>
                </BubbleMenu>

                <BubbleMenu
                  className={styles.bubbleMenuContainer}
                  editor={editor}
                  shouldShow={({ editor }) => editor.isActive('video')}
                  pluginKey="videoBubbleMenu"
                  // @ts-ignore
                  tippyOptions={{ offset: [200, 80], duration: 100, placement: 'top' }}
                >
                  <div className={styles.bubbleMenu}>
                    <button onClick={() => editor.chain().focus().updateAttributes('video', { width: '25%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('video', { width: '25%' }) ? styles.bubbleButtonActive : ''}`}>25%</button>
                    <button onClick={() => editor.chain().focus().updateAttributes('video', { width: '50%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('video', { width: '50%' }) ? styles.bubbleButtonActive : ''}`}>50%</button>
                    <button onClick={() => editor.chain().focus().updateAttributes('video', { width: '75%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('video', { width: '75%' }) ? styles.bubbleButtonActive : ''}`}>75%</button>
                    <button onClick={() => editor.chain().focus().updateAttributes('video', { width: '100%' }).run()} className={`${styles.bubbleButton} ${editor.isActive('video', { width: '100%' }) ? styles.bubbleButtonActive : ''}`}>100%</button>

                    <span className={styles.bubbleDivider}></span>
                    <button
                      onClick={() => editor.chain().focus().updateAttributes('video', { textAlign: 'left' }).run()}
                      className={`${styles.bubbleButton} ${editor.isActive('video', { textAlign: 'left' }) ? styles.bubbleButtonActive : ''}`}
                      title="왼쪽 정렬"
                    >
                      <AlignLeft size={16} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().updateAttributes('video', { textAlign: 'center' }).run()}
                      className={`${styles.bubbleButton} ${editor.isActive('video', { textAlign: 'center' }) ? styles.bubbleButtonActive : ''}`}
                      title="가운데 정렬"
                    >
                      <AlignCenter size={16} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().updateAttributes('video', { textAlign: 'right' }).run()}
                      className={`${styles.bubbleButton} ${editor.isActive('video', { textAlign: 'right' }) ? styles.bubbleButtonActive : ''}`}
                      title="오른쪽 정렬"
                    >
                      <AlignRight size={16} />
                    </button>
                  </div>
                </BubbleMenu>
              </>
            )}
            <EditorContent editor={editor} />
          </>
        )}
      </div>
      <div className={styles.seoSection}>
        <div className={styles.seoHeader}>
          <div>
            <h3 className={styles.seoTitle}>SEO & 발행 설정</h3>
            <p className={styles.seoSubtitle}>검색 노출 최적화를 위한 슬러그, 메타 타이틀, 설명 및 키워드를 설정합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowBulkSeoModal(true)}
            className={styles.bulkSeoOpenBtn}
            title="AI(ChatGPT 등)에서 생성된 SEO 텍스트를 한번에 붙여넣기"
          >
            <Sparkles size={16} /> SEO 일괄 붙여넣기
          </button>
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>URL 슬러그 (Slug)</label>
          <input type="text" placeholder="example-post-title" className={styles.seoInput} value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>발행 일시 (예약)</label>
          <input
            type="datetime-local"
            className={styles.seoInput}
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
          <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.4rem' }}>
            미래 시간을 선택하면 예약 발행됩니다.
          </p>
        </div>
        <div className={`${styles.inputGroup} ${styles.inputGroupFull}`}>
          <label className={styles.inputLabel}>메타 타이틀</label>
          <input type="text" placeholder="검색 결과 제목" className={styles.seoInput} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
        </div>
        <div className={`${styles.inputGroup} ${styles.inputGroupFull}`}>
          <label className={styles.inputLabel}>메타 설명</label>
          <textarea placeholder="검색 결과 설명문" className={styles.seoTextarea} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
        </div>
        <div className={`${styles.inputGroup} ${styles.inputGroupFull}`}>
          <label className={styles.inputLabel}>메타 키워드</label>
          <input type="text" placeholder="검색 키워드 (쉼표로 구분, 예: 비즈니스, AI, 레버리지)" className={styles.seoInput} value={metaKeywords} onChange={(e) => setMetaKeywords(e.target.value)} />
        </div>
        <div className={`${styles.inputGroup} ${styles.inputGroupFull}`}>
          <label className={styles.inputLabel}>OG Title</label>
          <input type="text" placeholder="SNS 공유 제목 (비우면 메타 타이틀 사용)" className={styles.seoInput} value={ogTitle} onChange={(e) => setOgTitle(e.target.value)} />
        </div>
        <div className={`${styles.inputGroup} ${styles.inputGroupFull}`}>
          <label className={styles.inputLabel}>OG Description</label>
          <textarea placeholder="SNS 공유 설명 (비우면 메타 설명 사용)" className={styles.seoTextarea} value={ogDescription} onChange={(e) => setOgDescription(e.target.value)} />
        </div>
      </div>
      <BulkSeoModal
        isOpen={showBulkSeoModal}
        onClose={() => setShowBulkSeoModal(false)}
        onApply={handleApplyBulkSeo}
        currentTitle={title}
      />
      <div className={styles.actionButtons}>
        <button onClick={() => handleSave('draft')} disabled={saving || !title || uploading} className={styles.draftButton}>
          {saving && status === 'draft' ? '저장 중...' : (status === 'published' ? '임시 저장' : '임시 저장')}
        </button>
        <button onClick={() => handleSave('published')} disabled={saving || !title || uploading} className={`${styles.saveButton} ${editId ? styles.updateButton : ''}`}>
          {saving && status === 'published' ? '발행 중...' : (status === 'draft' ? '임시저장 글 발행하기' : '발행하기')}
        </button>
      </div>
    </div>
  );
}
