'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  FileText, 
  FolderTree, 
  MessageSquare, 
  Files, 
  LogOut,
  PenSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  BarChart3,
  EyeOff
} from 'lucide-react';
import styles from './layout.module.css';

import LogoutButton from './LogoutButton';

const AdminSidebar = () => {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('admin_sidebar_collapsed');
    if (saved === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('admin_sidebar_collapsed', String(newState));
  };

  const menuItems = [
    { name: '대시보드', href: '/admin', icon: <LayoutDashboard size={20} /> },
    { name: '게시글 관리', href: '/admin/posts', icon: <FileText size={20} /> },
    { name: '📝 Shorts 관리', href: '/admin/bamboo', icon: <EyeOff size={20} /> },
    { name: '카테고리 관리', href: '/admin/categories', icon: <FolderTree size={20} /> },
    { name: '댓글 관리', href: '/admin/comments', icon: <MessageSquare size={20} /> },
    { name: '통계 리포트', href: '/admin/reports', icon: <BarChart3 size={20} /> },
    { name: '파일 관리', href: '/admin/files', icon: <Files size={20} /> },
    { name: 'SEO 최적화', href: '/admin/seo', icon: <Search size={20} /> },
  ];

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
      <div className={styles.sidebarHeader}>
        {!isCollapsed && (
          <Link href="/admin" className={styles.sidebarTitle}>
            관리자
          </Link>
        )}
        <button 
          onClick={toggleSidebar} 
          className={styles.collapseButton}
          title={isCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>
      
      <nav className={styles.nav}>
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`${styles.navLink} ${isActive ? styles.activeNavLink : ''}`}
              title={isCollapsed ? item.name : undefined}
            >
              {item.icon}
              <span className={styles.linkLabel}>{item.name}</span>
            </Link>
          );
        })}
        
        <div className={styles.sidebarDivider}>
          <Link href="/admin/editor" className={styles.navLink} title={isCollapsed ? "새 글 쓰기" : undefined}>
            <PenSquare size={20} />
            <span className={styles.linkLabel}>새 글 쓰기</span>
          </Link>
        </div>

        <div className={styles.logoutWrapper}>
          <LogoutButton isCollapsed={isCollapsed} />
        </div>
      </nav>
    </aside>
  );
};

export default AdminSidebar;
