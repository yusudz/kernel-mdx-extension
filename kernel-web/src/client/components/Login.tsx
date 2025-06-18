import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      setError('Please enter a token');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const success = await login(token);
      if (!success) {
        setError('Invalid token');
      }
    } catch (error) {
      setError('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2 style={{ marginBottom: '24px', textAlign: 'center' }}>Enter Token</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="auth-input"
            placeholder="Enter your auth token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={isLoading}
          />
          
          {error && (
            <div style={{ color: '#dc3545', marginBottom: '16px', fontSize: '0.9em' }}>
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;