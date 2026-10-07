import { Suspense } from 'react';
import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import EditorClientWrapper from './EditorClientWrapper';

export default async function AdminEditorPage() {
  const authorized = await isAdmin();
  if (!authorized) {
    redirect('/admin/login');
  }

  return <EditorClientWrapper />;
}
