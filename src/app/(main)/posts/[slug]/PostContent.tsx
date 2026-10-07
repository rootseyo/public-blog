'use client';

import parse, { HTMLReactParserOptions, domToReact, attributesToProps } from 'html-react-parser';
import dynamic from 'next/dynamic';
import postStyles from './post.module.css';
import { getPublicImageUrl } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';

const PdfSlideViewer = dynamic(() => import('@/app/(main)/admin/editor/PdfSlideViewer'), { 
  ssr: false,
  loading: () => <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px' }}>PDF 뷰어를 불러오는 중...</div>
});

const ImageSlideViewer = dynamic(() => import('@/app/(main)/admin/editor/ImageSlideViewer'), { 
  ssr: false,
  loading: () => <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px' }}>이미지 슬라이더를 불러오는 중...</div>
});

interface PostContentProps {
  content: string;
  title?: string;
}

function injectFallbackAltToHtml(html: string, title?: string): string {
  if (!title) return html;
  let count = 0;
  return html.replace(/<img([^>]*?)(\s*\/?>)/gi, (match, body, end) => {
    count++;
    const altRegex = /\salt\s*=\s*["']([^"']*)["']/i;
    const hasAltAttr = altRegex.test(body);
    
    if (hasAltAttr) {
      const matchAlt = body.match(altRegex);
      if (matchAlt && !matchAlt[1].trim()) {
        const fallbackText = `${title} 이미지 ${count}`;
        return `<img${body.replace(altRegex, ` alt="${fallbackText}"`)}${end}`;
      }
      return match;
    } else {
      const fallbackText = `${title} 이미지 ${count}`;
      return `<img${body} alt="${fallbackText}"${end}`;
    }
  });
}

const decodeHtmlEntities = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/');
};

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

interface ExecutedScriptProps {
  attribs: any;
  childrenText: string;
  trigger: boolean;
}

const ExecutedScript = ({ attribs, childrenText, trigger }: ExecutedScriptProps) => {
  // 1. 보안 규칙: 외부 스크립트(src 속성이 있는 경우)는 절대 실행하거나 렌더링하지 않음
  if (attribs && attribs.src) {
    return null;
  }

  // HTML Entity 디코딩 수행
  const decodedText = decodeHtmlEntities(childrenText);

  // 스크립트 내에서 대상 컨테이너 ID 동기적으로 추출 시도 (레이스 컨디션 방지)
  const idMatch = decodedText.match(/document\.getElementById\(\s*['"]([^'"]+)['"]\s*\)/);
  const queryMatch = decodedText.match(/document\.querySelector\(\s*['"]#([^'"]+)['"]\s*\)/);
  const containerId = idMatch ? idMatch[1] : (queryMatch ? queryMatch[1] : 'chart-macro-' + Math.random().toString(36).substring(2, 9));

  const [needsContainer, setNeedsContainer] = useState(false);

  useEffect(() => {
    // 만약 문서 상에 해당 ID의 엘리먼트가 존재하지 않으면 직접 컨테이너를 생성하여 제공함
    if (!document.getElementById(containerId)) {
      setNeedsContainer(true);
    } else {
      setNeedsContainer(false);
    }
  }, [containerId]);

  useEffect(() => {
    if (!trigger || !containerId) return;

    let isCancelled = false;
    let scriptElement: HTMLScriptElement | null = null;

    // 10ms 단위로 최대 100번(1초) 폴링하며 대상 div가 완전히 로드되었는지 대기 (비동기 렌더링 문제 해결)
    let attempts = 0;
    const checkAndRun = () => {
      if (isCancelled) return;

      if (document.getElementById(containerId)) {
        scriptElement = document.createElement('script');
        scriptElement.type = 'text/javascript';
        
        // Copy safe attributes (excluding src/async/defer/type/etc.)
        Object.keys(attribs || {}).forEach(key => {
          if (['src', 'async', 'defer', 'charset', 'type'].includes(key.toLowerCase())) return;
          scriptElement!.setAttribute(key, attribs[key]);
        });

        let code = decodedText;
        const hasEchartsInit = decodedText.includes('echarts.init');
        const hasOption = decodedText.includes('option =') || decodedText.includes('option1 =') || decodedText.includes('option2 =') || decodedText.includes('option3 =');

        // 만약 옵션 정의만 있고 echarts.init 호출이 없다면, 자동으로 echarts를 초기화해주는 매크로 적용
        if (!hasEchartsInit && hasOption) {
          let optionVar = 'option';
          if (decodedText.includes('option1 =')) optionVar = 'option1';
          else if (decodedText.includes('option2 =')) optionVar = 'option2';
          else if (decodedText.includes('option3 =')) optionVar = 'option3';

          code = `
            (function() {
              var echarts = window.echarts;
              try {
                ${decodedText}
                var chartDom = document.getElementById('${containerId}');
                if (chartDom && echarts) {
                  var myChart = echarts.init(chartDom);
                  myChart.setOption(${optionVar});
                  
                  // 브라우저 리사이즈 대응 (ResizeObserver)
                  var resizeObserver = new ResizeObserver(function() {
                    myChart.resize();
                  });
                  resizeObserver.observe(chartDom);
                }
              } catch (e) {
                console.error('ECharts Macro execution failed:', e);
              }
            })();
          `;
        } else {
          // 사용자가 직접 echarts.init을 호출하는 경우에도 변수 충돌 방지를 위해 IIFE로 감싸 실행
          code = `
            (function() {
              var echarts = window.echarts;
              try {
                ${decodedText}
              } catch (e) {
                console.error('ECharts Custom Script execution failed:', e);
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
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [attribs, decodedText, trigger, needsContainer, containerId]);

  if (needsContainer) {
    return (
      <div 
        id={containerId} 
        style={{ 
          width: '100%', 
          height: '400px', 
          margin: '2rem 0', 
          background: '#ffffff', 
          borderRadius: '12px',
          border: '1px solid var(--border-color, #e2e8f0)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
        }} 
      />
    );
  }

  return null;
};

function extractCustomCss(html: string): { cleanHtml: string; css: string } {
  let cssAcc = '';
  let cleanHtml = html;

  // 1. <style> 태그 추출 (data-type이 있거나 없는 style 태그 모두 매치)
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  cleanHtml = cleanHtml.replace(styleTagRegex, (match, cssContent) => {
    cssAcc += '\n' + cssContent;
    return '';
  });

  // 2. <pre><code> 안에 감싸진 [style]...[/style] 추출 (코드블록 형태)
  const preStyleRegex = /<pre[^>]*><code[^>]*>\s*\[style\]([\s\S]*?)\[\/style\]\s*<\/code><\/pre>/gi;
  cleanHtml = cleanHtml.replace(preStyleRegex, (match, cssContent) => {
    const decodedCss = cssContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    cssAcc += '\n' + decodedCss;
    return '';
  });

  // 3. 일반 [style]...[/style] 매크로 추출
  const inlineStyleRegex = /\[style\]([\s\S]*?)\[\/style\]/gi;
  cleanHtml = cleanHtml.replace(inlineStyleRegex, (match, cssContent) => {
    const cleanCss = cssContent
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    cssAcc += '\n' + cleanCss;
    return '';
  });

  // 매크로 제거로 인해 생기는 빈 문단들 제거
  cleanHtml = cleanHtml.replace(/<p>\s*(?:&nbsp;)?\s*<\/p>/gi, '');

  return { cleanHtml, css: cssAcc.trim() };
}

export default function PostContent({ content, title }: PostContentProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [echartsLoaded, setEchartsLoaded] = useState(false);
  let imageCount = 0;

  useEffect(() => {
    setIsMounted(true);
    // Load ECharts dynamically
    import('echarts').then((echarts) => {
      (window as any).echarts = wrapEcharts(echarts);
      setEchartsLoaded(true);
    }).catch(err => {
      console.error('Failed to load ECharts:', err);
      setEchartsLoaded(true);
    });
  }, []);

  const { cleanHtml: extractedHtml, css } = extractCustomCss(content);
  const cleanHtml = injectFallbackAltToHtml(extractedHtml, title);

  const options: HTMLReactParserOptions = {
    replace: (domNode: any) => {
      const { attribs, name, children } = domNode;

      // Handle style tags (just in case some bypass the extraction)
      if (name === 'style') {
        return null;
      }

      // Handle script tags (especially for ECharts or custom scripts)
      if (name === 'script') {
        const scriptText = children && children[0]?.data || '';
        return (
          <ExecutedScript 
            attribs={attribs || {}} 
            childrenText={scriptText} 
            trigger={echartsLoaded} 
          />
        );
      }

      // 속성이 없는 노드(텍스트 노드 등)는 처리 제외
      if (!domNode.attribs) return;

      const props = attributesToProps(attribs);

      // 1. 이미지 태그 경로 보정 및 캡션 처리
      if (name === 'img') {
        imageCount++;
        const isFirstImage = imageCount === 1;
        const originalSrc = attribs.src;
        const newSrc = originalSrc ? getPublicImageUrl(originalSrc) : '';
        const caption = attribs['data-caption'] || attribs.alt;
        
        const imgElement = (
          <img 
            {...props} 
            src={newSrc} 
            alt={attribs.alt || ''} 
            loading={isFirstImage ? "eager" : "lazy"}
            // @ts-ignore
            fetchPriority={isFirstImage ? "high" : "auto"}
          />
        );
        
        if (caption) {
          return (
            <div style={{ textAlign: 'center', margin: '1rem 0' }}>
              {imgElement}
              <div className={postStyles.imageCaption}>
                {caption.replace(/&quot;/g, '"').replace(/&amp;/g, '&')}
              </div>
            </div>
          );
        }
        return imgElement;
      }

      // 2. PDF 뷰어 처리
      if (attribs['data-type'] === 'pdf-viewer') {
        const src = getPublicImageUrl(attribs['data-src']);
        const descriptionsJson = attribs['data-descriptions'];
        
        let descriptions = {};
        if (descriptionsJson) {
          try {
            const decodedJson = descriptionsJson
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
            descriptions = JSON.parse(decodedJson);
          } catch (e) {
            console.error('Failed to parse PDF descriptions:', e);
          }
        }

        return (
          <PdfSlideViewer 
            url={src} 
            descriptions={descriptions} 
            isReadOnly={true}
            styles={postStyles}
          />
        );
      }

      // 3. 커스텀 이미지 컨테이너 (resizable-image) 처리
      if (attribs['data-type'] === 'resizable-image') {
        const textAlign = attribs.style?.match(/text-align:\s*(\w+)/)?.[1] || 'center';

        return (
          <div style={{ textAlign: textAlign as any, margin: '2.5rem 0' }}>
            <div style={{ display: 'inline-block', maxWidth: '100%' }}>
              {domToReact(children, options)}
            </div>
          </div>
        );
      }

      // 4. 링크 프리뷰 배너 처리
      if (attribs['data-type'] === 'link-preview') {
        const url = attribs['data-url'];
        const title = attribs['data-title'];
        const description = attribs['data-description'];
        const image = attribs['data-image'];
        const siteName = attribs['data-site-name'];

        return (
          <a href={url} target="_blank" rel="noopener noreferrer" className={postStyles.linkPreviewWrapper}>
            {image && <img src={image} alt={title || ''} className={postStyles.linkPreviewImage} />}
            <div className={postStyles.linkPreviewContent}>
              {siteName && <div className={postStyles.linkPreviewSite}>{siteName}</div>}
              <div className={postStyles.linkPreviewTitle}>{title || url}</div>
              {description && <div className={postStyles.linkPreviewDescription}>{description}</div>}
            </div>
          </a>
        );
      }

      // 5. 이미지 슬라이드 처리
      if (attribs['data-type'] === 'image-slide') {
        const imagesJson = attribs['data-images'];
        let images = [];
        if (imagesJson) {
          try {
            const decodedJson = imagesJson
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
            images = JSON.parse(decodedJson);
            // Public URL 보정
            images = images.map((img: any) => ({
              ...img,
              src: getPublicImageUrl(img.src)
            }));
          } catch (e) {
            console.error('Failed to parse Image Slide images:', e);
          }
        }

        return (
          <ImageSlideViewer 
            images={images} 
            isReadOnly={true}
            styles={postStyles}
          />
        );
      }
      // 6. 동영상 처리
      if (name === 'video' || attribs['data-type'] === 'video') {
        const src = attribs['data-src'] || attribs.src;
        const newSrc = src ? getPublicImageUrl(src) : '';
        const textAlign = attribs['data-text-align'] || attribs.style?.match(/text-align:\s*(\w+)/)?.[1] || 'center';
        
        const controls = attribs['data-controls'] !== 'false' && (attribs['data-controls'] !== undefined || attribs.controls !== undefined);
        const autoplay = attribs['data-autoplay'] === 'true' || attribs.autoplay !== undefined;
        const loop = attribs['data-loop'] === 'true' || attribs.loop !== undefined;
        const muted = attribs['data-muted'] === 'true' || attribs.muted !== undefined;

        if (name === 'video') {
          return (
            <video 
              {...props} 
              src={newSrc} 
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', ...props.style }}
              controls={controls}
              autoPlay={autoplay}
              loop={loop}
              muted={muted}
              playsInline
            />
          );
        }

        // data-type="video" 인 경우 (wrapper div)
        return (
          <div style={{ textAlign: textAlign as any, margin: '1.5rem 0' }}>
            <div style={{ display: 'inline-block', width: '100%', maxWidth: '100%' }}>
              <video 
                src={newSrc} 
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }}
                controls={controls}
                autoPlay={autoplay}
                loop={loop}
                muted={muted}
                playsInline
              />
            </div>
          </div>
        );
      }
    },
  };

  // Hydration 불일치를 완전히 방지하기 위해, 마운트 전에는 원본 HTML만 보여주고
  // 마운트 후에 React 컴포넌트로 변환된 내용을 보여줍니다.
  // 이 방식은 SEO에 약간 불리할 수 있으나 Mismatch 오류를 완벽하게 차단합니다.
  if (!isMounted) {
    return (
      <>
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        <div className={postStyles.content} dangerouslySetInnerHTML={{ __html: cleanHtml }} suppressHydrationWarning />
      </>
    );
  }

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <div className={postStyles.content}>
        {parse(cleanHtml, options)}
      </div>
    </>
  );
}
