import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import { adminGetBambooPosts, getForbiddenWords } from '../actions';
import BambooManager from './BambooManager';

export default async function ShortsManagementPage() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  const posts = await adminGetBambooPosts();
  const forbiddenWords = await getForbiddenWords();

  return (
    <BambooManager 
      initialPosts={posts} 
      initialForbiddenWords={forbiddenWords} 
    />
  );
}
