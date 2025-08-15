import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a Vercel cron request
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const backendUrl = process.env.BACKEND_URL || 'https://api.getpryvacy.com';
  const sweeperSecret = process.env.SWEEPER_SECRET;

  if (!sweeperSecret) {
    console.error('SWEEPER_SECRET not configured');
    return res.status(503).json({ error: 'Sweeper not configured' });
  }

  try {
    const response = await fetch(`${backendUrl}/sweeper/clean`, {
      method: 'POST',
      headers: {
        'x-sweeper-secret': sweeperSecret,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Sweeper returned ${response.status}`);
    }

    const result = await response.json();
    console.log('Sweeper cleanup completed:', result);
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Sweeper cron failed:', error);
    return res.status(500).json({
      error: 'Sweeper execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}