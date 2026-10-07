'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import styles from './bamboo.module.css';
import { 
  addBambooPost, 
  deleteBambooPost, 
  BambooPostData,
  BambooCommentData,
  addBambooComment,
  deleteBambooComment,
  likeBambooPost
} from './actions';
import Link from 'next/link';
import { ArrowLeft, Trash2, Send, MessageSquare, CornerDownRight, ThumbsUp, Heart, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Link as LinkIcon, Link2Off, Image as ImageIcon } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Fragment, Slice } from '@tiptap/pm/model';
import parse, { HTMLReactParserOptions, domToReact } from 'html-react-parser';
import { compressImage } from '@/lib/client-utils';
import { getPublicImageUrl } from '@/lib/utils';

const allowedTags = ['p', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'a', 'br', 'img'];

interface UploadResponse {
  url?: string;
}

const parseOptions: HTMLReactParserOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace: (domNode: any) => {
    if (domNode.type === 'tag') {
      if (!allowedTags.includes(domNode.name)) {
        if (domNode.children && domNode.children.length > 0) {
          return <>{domToReact(domNode.children, parseOptions)}</>;
        }
        return null;
      }

      if (domNode.name === 'img') {
        const src = domNode.attribs?.src || '';
        const isSafeSrc = src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/');
        if (isSafeSrc) {
          const alt = domNode.attribs?.alt || '';
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={getPublicImageUrl(src)} 
              alt={alt} 
              style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0.75rem auto', borderRadius: '8px' }} 
            />
          );
        }
        return null;
      }

      if (domNode.name === 'a') {
        const href = domNode.attribs?.href || '';
        const isSafeHref = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/');
        if (isSafeHref) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={styles.contentLink}>
              {domNode.children ? domToReact(domNode.children, parseOptions) : href}
            </a>
          );
        } else {
          return <span>{domNode.children ? domToReact(domNode.children, parseOptions) : href}</span>;
        }
      }
    }
  }
};

interface BambooBoardClientProps {
  initialPosts: BambooPostData[];
  initialComments: BambooCommentData[];
  singlePostView?: boolean;
}

export default function BambooBoardClient({ initialPosts, initialComments, singlePostView = false }: BambooBoardClientProps) {
  const [posts, setPosts] = useState<BambooPostData[]>(initialPosts);
  const [comments, setComments] = useState<BambooCommentData[]>(initialComments);
  const [charsCount, setCharsCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  const [clientToken, setClientToken] = useState('');
  const [myPostIds, setMyPostIds] = useState<number[]>([]);
  const [myCommentIds, setMyCommentIds] = useState<number[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<number[]>([]);
  
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>(() => {
    if (singlePostView && initialPosts.length > 0) {
      return { [initialPosts[0].id]: true };
    }
    return {};
  });
  const [isPending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize client token, my posts & comments tracking, and liked posts
  useEffect(() => {
    let token = localStorage.getItem('bamboo_client_token');
    if (!token) {
      token = 'token_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('bamboo_client_token', token);
    }
    setClientToken(token);

    const savedPosts = localStorage.getItem('bamboo_my_post_ids');
    if (savedPosts) {
      try { setMyPostIds(JSON.parse(savedPosts)); } catch (e) { console.error(e); }
    }

    const savedComments = localStorage.getItem('bamboo_my_comment_ids');
    if (savedComments) {
      try { setMyCommentIds(JSON.parse(savedComments)); } catch (e) { console.error(e); }
    }

    const savedLikes = localStorage.getItem('bamboo_liked_post_ids');
    if (savedLikes) {
      try { setLikedPostIds(JSON.parse(savedLikes)); } catch (e) { console.error(e); }
    }
  }, []);

  // Update Tiptap character count
  const handleEditorUpdate = (editorInstance: any) => {
    const text = editorInstance.getText();
    setCharsCount(text.replace(/\s/g, '').length);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }
    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data: UploadResponse = await res.json();
      if (res.ok && data.url) {
        editor?.chain().focus().setImage({ src: data.url }).run();
      } else {
        alert('이미지 업로드에 실패했습니다.');
      }
    } catch (err) {
      console.error('Image upload error:', err);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        heading: false,
        codeBlock: false,
        blockquote: false,
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { class: styles.contentLink },
      }),
      ImageExtension.configure({
        HTMLAttributes: { style: 'max-width: 100%; height: auto; display: block; margin: 0.75rem auto; border-radius: 8px;' },
      }),
    ],
    content: '',
    onUpdate: ({ editor: ed }) => handleEditorUpdate(ed),
    editorProps: {
      transformPastedText(text) {
        return text;
      },
      transformPastedHTML(html) {
        return html;
      },
      transformPasted(slice) {
        const removeScriptsAndStyles = (fragment: Fragment): Fragment => {
          const newNodes: any[] = [];
          fragment.forEach((node) => {
            if (node.type.name === 'script' || node.type.name === 'style') {
              return;
            }
            if (node.isText) {
              newNodes.push(node);
            } else {
              const cleanedChildFragment = removeScriptsAndStyles(node.content);
              newNodes.push(node.copy(cleanedChildFragment));
            }
          });
          return Fragment.fromArray(newNodes);
        };
        return new Slice(removeScriptsAndStyles(slice.content), slice.openStart, slice.openEnd);
      },
    },
  });

  const getAvatarColor = (id: number) => {
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1'];
    return colors[id % colors.length];
  };

  const getAvatarChar = (text: string) => {
    const plainText = text ? text.replace(/<[^>]*>?/gm, '').trim() : '';
    return plainText ? (Array.from(plainText)[0] || '익') : '익';
  };

  const toggleComments = (postId: number) => {
    setExpandedComments(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  const handleLikeClick = async (postId: number) => {
    if (likedPostIds.includes(postId)) {
      alert('이미 좋아요를 누르셨습니다.');
      return;
    }

    // Optimistic UI update
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
    const newLiked = [...likedPostIds, postId];
    setLikedPostIds(newLiked);
    localStorage.setItem('bamboo_liked_post_ids', JSON.stringify(newLiked));

    const res = await likeBambooPost(postId);
    if (!res.success) {
      // Rollback on error
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: Math.max(0, p.likes - 1) } : p));
      const rolledBack = likedPostIds.filter(id => id !== postId);
      setLikedPostIds(rolledBack);
      localStorage.setItem('bamboo_liked_post_ids', JSON.stringify(rolledBack));
      alert(res.error || '좋아요 처리에 실패했습니다.');
    }
  };

  const handlePostSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editor) return;

    const htmlContent = editor.getHTML();
    const plainText = editor.getText().trim();
    const nonSpaceLen = plainText.replace(/\s/g, '').length;

    if (plainText.length === 0) {
      alert('내용을 입력해 주세요.');
      return;
    }

    if (nonSpaceLen > 2000) {
      alert('공백 제외 2000자 이내로 작성해 주세요.');
      return;
    }

    const formData = new FormData();
    formData.append('content', htmlContent);

    startTransition(async () => {
      const result = await addBambooPost(formData, clientToken);
      if (result.success && result.id) {
        const newPost: BambooPostData = {
          id: result.id,
          author_name: '익명',
          content: htmlContent,
          likes: 0,
          created_at: new Date().toISOString()
        };

        setPosts(prev => [newPost, ...prev]);
        editor.commands.setContent('');
        setCharsCount(0);

        const updatedMyPosts = [result.id, ...myPostIds];
        setMyPostIds(updatedMyPosts);
        localStorage.setItem('bamboo_my_post_ids', JSON.stringify(updatedMyPosts));

        // Expand comments section automatically for newly created post
        setExpandedComments(prev => ({ ...prev, [result.id]: true }));
      } else {
        alert(result.error || '글 등록에 실패했습니다.');
      }
    });
  };

  const handleDeletePostClick = (postId: number) => {
    if (!confirm('정말로 이 글을 삭제하시겠습니까?')) return;

    startTransition(async () => {
      const result = await deleteBambooPost(postId, clientToken);
      if (result.success) {
        setPosts(prev => prev.filter(p => p.id !== postId));
        const updatedMyPosts = myPostIds.filter(id => id !== postId);
        setMyPostIds(updatedMyPosts);
        localStorage.setItem('bamboo_my_post_ids', JSON.stringify(updatedMyPosts));
      } else {
        alert(result.error || '삭제 실패');
      }
    });
  };

  const handleCommentAdded = (newComment: BambooCommentData) => {
    setComments(prev => [...prev, newComment]);
    const updatedMyComments = [newComment.id, ...myCommentIds];
    setMyCommentIds(updatedMyComments);
    localStorage.setItem('bamboo_my_comment_ids', JSON.stringify(updatedMyComments));
  };

  const handleCommentDeleted = (commentId: number) => {
    setComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId));
    const updatedMyComments = myCommentIds.filter(id => id !== commentId);
    setMyCommentIds(updatedMyComments);
    localStorage.setItem('bamboo_my_comment_ids', JSON.stringify(updatedMyComments));
  };

  return (
    <div className={styles.container}>
      {singlePostView && (
        <Link href="/shorts" className={styles.backLink}>
          <ArrowLeft size={16} />
          전체 📝 Shorts로 돌아가기
        </Link>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>📝 Shorts</h1>
        <p className={styles.description}>짧은 생각을 자유롭게 기록하고 공유하는 📝 Shorts 공간입니다. 2000자 이내로 편하게 작성해보세요.</p>
      </header>

      {/* Post creation form */}
      {!singlePostView && (
        <form onSubmit={handlePostSubmit} className={styles.formCard}>
          <div className={styles.editorWrapper}>
            <div className={styles.editorToolbar}>
              <button 
                type="button"
                onClick={() => editor?.chain().focus().toggleBold().run()} 
                className={`${styles.toolbarButton} ${editor?.isActive('bold') ? styles.toolbarButtonActive : ''}`} 
                title="굵게"
              >
                <Bold size={15} />
              </button>
              <button 
                type="button"
                onClick={() => editor?.chain().focus().toggleItalic().run()} 
                className={`${styles.toolbarButton} ${editor?.isActive('italic') ? styles.toolbarButtonActive : ''}`} 
                title="기울임"
              >
                <Italic size={15} />
              </button>
              <button 
                type="button"
                onClick={() => editor?.chain().focus().toggleUnderline().run()} 
                className={`${styles.toolbarButton} ${editor?.isActive('underline') ? styles.toolbarButtonActive : ''}`} 
                title="밑줄"
              >
                <UnderlineIcon size={15} />
              </button>
              <button 
                type="button"
                onClick={() => editor?.chain().focus().toggleStrike().run()} 
                className={`${styles.toolbarButton} ${editor?.isActive('strike') ? styles.toolbarButtonActive : ''}`} 
                title="취소선"
              >
                <Strikethrough size={15} />
              </button>
              <div className={styles.toolbarDivider} />
              <button 
                type="button"
                onClick={() => editor?.chain().focus().toggleBulletList().run()} 
                className={`${styles.toolbarButton} ${editor?.isActive('bulletList') ? styles.toolbarButtonActive : ''}`} 
                title="글머리 기호 목록"
              >
                <List size={15} />
              </button>
              <button 
                type="button"
                onClick={() => editor?.chain().focus().toggleOrderedList().run()} 
                className={`${styles.toolbarButton} ${editor?.isActive('orderedList') ? styles.toolbarButtonActive : ''}`} 
                title="번호 매기기 목록"
              >
                <ListOrdered size={15} />
              </button>
              <div className={styles.toolbarDivider} />
              <button 
                type="button"
                onClick={() => {
                  if (editor?.isActive('link')) {
                    editor.chain().focus().unsetLink().run();
                  } else {
                    const url = prompt('링크 URL을 입력하세요:');
                    if (url) {
                      const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
                      editor?.chain().focus().setLink({ href: formattedUrl }).run();
                    }
                  }
                }} 
                className={`${styles.toolbarButton} ${editor?.isActive('link') ? styles.toolbarButtonActive : ''}`} 
                title={editor?.isActive('link') ? "링크 해제" : "링크 삽입"}
              >
                {editor?.isActive('link') ? <Link2Off size={15} /> : <LinkIcon size={15} />}
              </button>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()} 
                className={styles.toolbarButton} 
                title="이미지 삽입"
                disabled={isUploading}
              >
                <ImageIcon size={15} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
            <div className={styles.editorContainer}>
              <EditorContent editor={editor} className={styles.editorContent} />
            </div>
          </div>

          <div className={styles.textareaWrapper} style={{ height: 0, overflow: 'hidden', margin: 0, padding: 0 }}>
            <div className={`${styles.counterBadge} ${charsCount > 1900 ? styles.counterDanger : charsCount > 1700 ? styles.counterWarning : ''}`} style={{ position: 'static', textAlign: 'right', marginBottom: '0.4rem' }}>
              {2000 - charsCount}자 남음 (공백 제외)
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              글자 수: <strong style={{ color: charsCount > 2000 ? '#ef4444' : 'var(--foreground)' }}>{charsCount}</strong> / 2000자 (공백 제외)
            </span>
          </div>

          <button 
            type="submit" 
            className={styles.submitButton} 
            disabled={isPending || isUploading || charsCount === 0 || charsCount > 2000}
          >
            <Send size={16} />
            {isPending ? '게시 중...' : 'Shorts 등록하기'}
          </button>
        </form>
      )}

      {/* Feed list */}
      <div className={styles.postsList}>
        {posts.length > 0 ? (
          posts.map((post) => {
            const isMyPost = myPostIds.includes(post.id);
            const plainText = post.content ? post.content.replace(/<[^>]*>?/gm, '').trim() : '';
            const avatarChar = plainText ? (Array.from(plainText)[0] || '익') : '익';
            const avatarColor = getAvatarColor(post.id);
            const postComments = comments.filter(c => c.bamboo_post_id === post.id);

            const detailHref = `/shorts/${post.id}${post.slug ? '-' + post.slug : ''}`;
            const firstSentence = plainText.match(/^[^.!?\n]+[.!?]?/)?.[0]?.trim();
            const fallbackTitle = (firstSentence && firstSentence.length >= 5) ? firstSentence.slice(0, 45) : `익명 게시글 #${post.id}`;
            const displayTitle = post.seo_title || fallbackTitle;
            const displaySummary = post.summary || (plainText.length > 0 ? plainText.slice(0, 140) + (plainText.length > 140 ? '...' : '') : undefined);

            return (
              <article key={post.id} className={styles.postCard}>
                <div className={styles.postHeader}>
                  <div className={styles.authorMeta}>
                    <div className={styles.avatar} style={{ background: avatarColor }}>
                      {avatarChar}
                    </div>
                    <div className={styles.authorDetails}>
                      <span className={styles.authorName}>
                        {post.author_name}
                        {isMyPost && <span className={styles.ownBadge}>내 글</span>}
                      </span>
                      <span className={styles.timeText} suppressHydrationWarning>
                        {new Date(post.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>

                  {isMyPost && (
                    <div className={styles.actions}>
                      <button 
                        onClick={() => handleDeletePostClick(post.id)} 
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        title="글 삭제"
                      >
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                {/* Post Title & Summary */}
                <h2 className={styles.postTitle}>
                  <Link href={detailHref} className={styles.postTitleLink}>
                    {displayTitle}
                  </Link>
                </h2>

                <div className={styles.postContent}>
                  {parse(post.content, parseOptions)}
                </div>

                <div className={styles.postFooter}>
                  <button 
                    onClick={() => handleLikeClick(post.id)}
                    className={`${styles.likeBtn} ${likedPostIds.includes(post.id) ? styles.liked : ''}`}
                  >
                    <Heart size={14} fill={likedPostIds.includes(post.id) ? 'currentColor' : 'none'} />
                    좋아요 {post.likes}
                  </button>

                  <button 
                    onClick={() => toggleComments(post.id)}
                    className={styles.commentToggleBtn}
                  >
                    <MessageSquare size={14} />
                    댓글 {postComments.length}
                  </button>
                </div>

                {/* Collapsible comments section */}
                {expandedComments[post.id] && (
                  <div className={styles.commentsSection}>
                    <CommentsSubSection 
                      postId={post.id}
                      comments={postComments}
                      clientToken={clientToken}
                      myCommentIds={myCommentIds}
                      onCommentAdded={handleCommentAdded}
                      onCommentDeleted={handleCommentDeleted}
                      getAvatarColor={getAvatarColor}
                      getAvatarChar={getAvatarChar}
                    />
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>💬</div>
            <p>아직 작성된 글이 없습니다.</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>첫 번째 생각과 소식을 자유롭게 공유해 보세요!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Separate component for post comments and 2-depth replies
function CommentsSubSection({
  postId,
  comments,
  clientToken,
  myCommentIds,
  onCommentAdded,
  onCommentDeleted,
  getAvatarColor,
  getAvatarChar
}: {
  postId: number;
  comments: BambooCommentData[];
  clientToken: string;
  myCommentIds: number[];
  onCommentAdded: (comment: BambooCommentData) => void;
  onCommentDeleted: (commentId: number) => void;
  getAvatarColor: (id: number) => string;
  getAvatarChar: (text: string) => string;
}) {
  const [content, setContent] = useState('');
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleCommentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rawContent = content.trim();
    const nonSpaceLen = rawContent.replace(/\s/g, '').length;

    if (rawContent.length === 0 || nonSpaceLen > 120) {
      alert('공백 제외 120자 이내로 작성해 주세요.');
      return;
    }

    const formData = new FormData();
    formData.append('content', rawContent);

    startTransition(async () => {
      const result = await addBambooComment(postId, null, formData, clientToken);
      if (result.success && result.id) {
        const newComment: BambooCommentData = {
          id: result.id,
          bamboo_post_id: postId,
          parent_id: null,
          author_name: '익명',
          content: rawContent,
          created_at: new Date().toISOString()
        };
        onCommentAdded(newComment);
        setContent('');
      } else {
        alert(result.error || '댓글 등록 실패');
      }
    });
  };

  const handleReplySubmit = (parentId: number, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rawContent = replyContent.trim();
    const nonSpaceLen = rawContent.replace(/\s/g, '').length;

    if (rawContent.length === 0 || nonSpaceLen > 120) {
      alert('공백 제외 120자 이내로 작성해 주세요.');
      return;
    }

    const formData = new FormData();
    formData.append('content', rawContent);

    startTransition(async () => {
      const result = await addBambooComment(postId, parentId, formData, clientToken);
      if (result.success && result.id) {
        const newReply: BambooCommentData = {
          id: result.id,
          bamboo_post_id: postId,
          parent_id: parentId,
          author_name: '익명',
          content: rawContent,
          created_at: new Date().toISOString()
        };
        onCommentAdded(newReply);
        setReplyContent('');
        setReplyingToId(null);
      } else {
        alert(result.error || '답글 등록 실패');
      }
    });
  };

  const handleDeleteCommentClick = (commentId: number) => {
    if (!confirm('정말로 이 댓글을 삭제하시겠습니까?')) return;

    startTransition(async () => {
      const result = await deleteBambooComment(commentId, clientToken);
      if (result.success) {
        onCommentDeleted(commentId);
      } else {
        alert(result.error || '댓글 삭제 실패');
      }
    });
  };

  // Group 1-depth comments and 2-depth replies
  const rootComments = comments.filter(c => c.parent_id === null);

  return (
    <div>
      <div className={styles.commentsList}>
        {rootComments.map((rootComment) => {
          const isMyComment = myCommentIds.includes(rootComment.id);
          const replies = comments.filter(c => c.parent_id === rootComment.id);
          const avatarChar = getAvatarChar(rootComment.content);
          const avatarColor = getAvatarColor(rootComment.id);

          return (
            <div key={rootComment.id} className={styles.commentItem}>
              <div className={styles.commentHeader}>
                <div className={styles.commentMeta}>
                  <div className={styles.commentAvatar} style={{ backgroundColor: avatarColor }}>
                    {avatarChar}
                  </div>
                  <span className={styles.commentAuthor}>{rootComment.author_name}</span>
                  {isMyComment && <span className={styles.ownBadge} style={{ margin: 0, fontSize: '0.6rem' }}>내 댓글</span>}
                  <span className={styles.commentTime} suppressHydrationWarning>
                    {new Date(rootComment.created_at).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {isMyComment && (
                  <button 
                    onClick={() => handleDeleteCommentClick(rootComment.id)}
                    className={`${styles.commentActionBtn} ${styles.commentDeleteBtn}`}
                    title="삭제"
                  >
                    삭제
                  </button>
                )}
              </div>

              <p className={styles.commentContent}>{rootComment.content}</p>

              <div className={styles.commentActions}>
                <button 
                  onClick={() => {
                    if (replyingToId === rootComment.id) {
                      setReplyingToId(null);
                    } else {
                      setReplyingToId(rootComment.id);
                      setReplyContent('');
                    }
                  }}
                  className={styles.commentActionBtn}
                >
                  <CornerDownRight size={12} />
                  답글 달기
                </button>
              </div>

              {/* 2-depth replies list */}
              {replies.length > 0 && (
                <div className={styles.replyContainer}>
                  {replies.map((reply) => {
                    const isMyReply = myCommentIds.includes(reply.id);
                    const replyAvatarChar = getAvatarChar(reply.content);
                    const replyAvatarColor = getAvatarColor(reply.id);

                    return (
                      <div key={reply.id} className={styles.replyItem}>
                        <span className={styles.replyIndicator}>↳</span>
                        <div className={styles.commentHeader}>
                          <div className={styles.commentMeta}>
                            <div className={styles.commentAvatar} style={{ backgroundColor: replyAvatarColor }}>
                              {replyAvatarChar}
                            </div>
                            <span className={styles.commentAuthor}>{reply.author_name}</span>
                            {isMyReply && <span className={styles.ownBadge} style={{ margin: 0, fontSize: '0.6rem' }}>내 댓글</span>}
                            <span className={styles.commentTime} suppressHydrationWarning>
                              {new Date(reply.created_at).toLocaleString('ko-KR', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          
                          {isMyReply && (
                            <button 
                              onClick={() => handleDeleteCommentClick(reply.id)}
                              className={`${styles.commentActionBtn} ${styles.commentDeleteBtn}`}
                              title="삭제"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                        <p className={styles.commentContent}>{reply.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reply Form */}
              {replyingToId === rootComment.id && (
                <form onSubmit={(e) => handleReplySubmit(rootComment.id, e)} className={styles.replyForm}>
                  <div className={styles.commentTextareaWrapper}>
                    <textarea 
                      placeholder="답글을 적어보세요... (공백 제외 120자)"
                      maxLength={600}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className={styles.commentTextarea}
                      required
                    />
                    <div className={`${styles.counterBadge} ${replyContent.replace(/\s/g, '').length > 110 ? styles.counterDanger : ''}`}>
                      {120 - replyContent.replace(/\s/g, '').length}자 남음
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                    <button 
                      type="button" 
                      onClick={() => setReplyingToId(null)}
                      className={styles.commentSubmitBtn}
                      style={{ backgroundColor: 'var(--secondary-bg)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                    >
                      취소
                    </button>
                    <button 
                      type="submit" 
                      className={styles.commentSubmitBtn}
                      disabled={isPending || replyContent.replace(/\s/g, '').length === 0}
                    >
                      {isPending ? '등록 중...' : '답글 등록'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* Root Comment Form */}
      <form onSubmit={handleCommentSubmit} className={styles.commentForm}>
        <div className={styles.commentTextareaWrapper}>
          <textarea 
            name="content"
            placeholder="댓글을 적어보세요... (공백 제외 120자)"
            maxLength={600}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={styles.commentTextarea}
            required
          />
          <div className={`${styles.counterBadge} ${content.replace(/\s/g, '').length > 110 ? styles.counterDanger : ''}`}>
            {120 - content.replace(/\s/g, '').length}자 남음
          </div>
        </div>
        <button 
          type="submit" 
          className={styles.commentSubmitBtn}
          disabled={isPending || content.replace(/\s/g, '').length === 0}
        >
          {isPending ? '등록 중...' : '댓글 등록'}
        </button>
      </form>
    </div>
  );
}
