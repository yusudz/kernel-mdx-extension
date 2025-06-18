import { ConfigManager } from '../services/storage/ConfigManager';

export function createAuthMiddleware(configManager: ConfigManager) {
  return (req: any, res: any, next: any) => {
    // Skip auth for health check and auth routes (path is relative to /api mount)
    if (req.path === '/health' || req.path.startsWith('/auth')) {
      return next();
    }

    const authToken = configManager.get('authToken');
    const isDefaultToken = authToken === 'your-secret-token-here';
    
    // If default token is still set, require config change
    if (!authToken || isDefaultToken) {
      return res.status(401).json({ 
        error: 'Authentication not configured', 
        setup: true,
        message: 'Please change the default authToken in data/config.json'
      });
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    const providedToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : req.headers['x-auth-token'] || req.query.token;

    if (!providedToken || providedToken !== authToken) {
      return res.status(401).json({ 
        error: 'Invalid or missing authentication token' 
      });
    }

    next();
  };
}