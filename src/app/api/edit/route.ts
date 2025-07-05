import { NextRequest, NextResponse } from 'next/server';
import { handleEditClaudeCodeRequest } from '@/lib/api/edit-handler';
import { validateAndParseEditRouteParams } from '@/lib/api/route-validation';

// This api route needs either next-auth or api key authentication
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const logPrefix = 'EDIT API';
    
    // Validate and parse route parameters
    const validationResult = validateAndParseEditRouteParams(body, logPrefix);
    if (!validationResult.success) {
      return validationResult.error!;
    }

    return handleEditClaudeCodeRequest(request, logPrefix, validationResult.data!);
  } catch (error) {
    console.error('[EDIT API] Failed to parse request body:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
} 