import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/nextauth-options';
import { deleteClaudeMdContent, saveClaudeMdContent } from '@/lib/claudeCode/claudemd';

// Save the CLAUDE.md file content
export async function POST(request: NextRequest) {
  try {
    // Dashboard-only: require an authenticated NextAuth session (do NOT allow API keys)
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content } = await request.json();

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Content must be a string' }, { status: 400 });
    }

    await saveClaudeMdContent({ content });

    return NextResponse.json({
      message: 'CLAUDE.md file updated successfully',
      success: true,
    });
  } catch (error) {
    console.error('Error writing CLAUDE.md:', error);
    return NextResponse.json({ error: 'Failed to write CLAUDE.md file' }, { status: 500 });
  }
}

// Delete the CLAUDE.md file
export async function DELETE(_request: NextRequest) {
  try {
    // Dashboard-only: require an authenticated NextAuth session (do NOT allow API keys)
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await deleteClaudeMdContent();

      return NextResponse.json({
        message: 'CLAUDE.md file removed successfully',
        success: true,
      });
    } catch (error) {
      // If file doesn't exist, that's also success
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return NextResponse.json({
          message: 'CLAUDE.md file was already removed',
          success: true,
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error deleting CLAUDE.md:', error);
    return NextResponse.json({ error: 'Failed to delete CLAUDE.md file' }, { status: 500 });
  }
}
