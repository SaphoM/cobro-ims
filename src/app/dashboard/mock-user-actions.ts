'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function switchMockUserAction(formData: FormData) {
  if (process.env.DATA_SOURCE !== 'mock') return;
  const userId = formData.get('userId');
  if (typeof userId !== 'string') return;
  const jar = await cookies();
  jar.set('mock_user_id', userId, { path: '/', httpOnly: true, sameSite: 'lax' });
  redirect('/dashboard');
}
