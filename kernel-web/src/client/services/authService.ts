interface AuthStatus {
  hasToken: boolean;
  needsSetup: boolean;
  message?: string;
}

class AuthService {
  async checkStatus(): Promise<AuthStatus> {
    const response = await fetch('/api/auth/status');
    if (!response.ok) {
      throw new Error('Failed to check auth status');
    }
    return response.json();
  }

  async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      return data.valid;
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  }
}

export const authService = new AuthService();