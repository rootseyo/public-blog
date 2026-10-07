import { isAdmin } from './actions';
import AdminSidebar from './AdminSidebar';
import styles from './layout.module.css';
import { headers } from 'next/headers';
import { runMigrations } from './actions';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLoggedIn = await isAdmin();
  
  if (isLoggedIn) {
    await runMigrations();
  }
  
  const headersList = await headers();
  const pathname = headersList.get('x-invoke-path') || '';
  const isLoginPage = pathname === '/admin/login';

  if (!isLoggedIn || isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className={styles.adminLayout}>
      <AdminSidebar />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  );
}
