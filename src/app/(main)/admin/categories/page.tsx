import styles from '../admin.module.css';
import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import { getCategories } from '../actions';
import CategoryManager from './CategoryManager';

export default async function CategoryManagement() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  const categories = await getCategories();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>카테고리 관리</h1>
      </header>
      
      <CategoryManager initialCategories={categories} />
    </div>
  );
}
