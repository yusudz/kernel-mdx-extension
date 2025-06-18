import React from 'react';

const AuthSetup: React.FC = () => {
  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>Setup Required</h2>
        <p style={{ marginBottom: '16px', color: '#666' }}>
          Please change the default <code>authToken</code> in <code>data/config.json</code>
        </p>
        <p style={{ color: '#666' }}>
          Then refresh this page and login with your token.
        </p>
      </div>
    </div>
  );
};

export default AuthSetup;