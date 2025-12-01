import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { verifyUser, updatePassword } from '@/lib/auth/user-store';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Current password and new password are required' },
      { status: 400 }
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: 'New password must be at least 6 characters' },
      { status: 400 }
    );
  }

  const username = session.user.name;
  const isValid = await verifyUser(username, currentPassword);

  if (!isValid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const updated = await updatePassword(username, newPassword);

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Password updated successfully' });
}
