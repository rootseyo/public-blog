'use client';

import { logout } from './actions';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';
import { LogOut } from 'lucide-react';

export default function LogoutButton({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <button 
      onClick={handleLogout} 
      className={styles.logoutButton}
      title={isCollapsed ? "로그아웃" : undefined}
      style={isCollapsed ? { padding: '0.5rem', display: 'flex', justifyContent: 'center' } : {}}
    >
      {isCollapsed ? <LogOut size={20} /> : '로그아웃'}
    </button>
  );
}
