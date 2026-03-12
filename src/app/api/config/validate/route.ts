import { NextResponse } from 'next/server';
import { isConfigurationComplete, validateConfig } from '@/lib/config/client-settings';
import { getConfig } from '@/lib/config/server-actions';

export async function GET() {
  const config = await getConfig();

  const errors: string[] = [];
  errors.push(...validateConfig(config));

  // Completeness checks (what users actually care about)
  if (!config.gitlab.token) {
    errors.push('GitLab token is not set');
  }

  const isComplete = isConfigurationComplete(config);
  const valid = errors.length === 0 && isComplete;

  return NextResponse.json(
    {
      valid,
      errors,
      message: valid
        ? 'Configuration is valid'
        : isComplete
          ? 'Configuration has validation issues'
          : 'Configuration is incomplete',
    },
    // Always 200: this endpoint is used by the UI and should not take down the reverse proxy.
    { status: 200 }
  );
}
