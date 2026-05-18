import { useState } from 'react';

function LoginScreen({
  onLogin,
  isAuthenticating,
  errorMessage,
  authApiBaseUrl,
  onAuthApiBaseUrlChange,
  captchaSrc,
  captchaUuid,
  captchaLoading,
  captchaEnabled,
  onRefreshCaptcha,
  captchaCode,
  onCaptchaCodeChange
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin({
      username: username.trim(),
      password,
      code: captchaCode.trim(),
      uuid: captchaUuid
    });
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">⇌</div>
          <div>
            <div className="login-title">自动化数据断言</div>
            <div className="login-subtitle">轻量、安静、聚焦地进入你的数据核对工作台</div>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-auth-base">认证服务根地址</label>
            <input
              id="login-auth-base"
              type="text"
              className="input login-auth-base-input"
              value={authApiBaseUrl}
              onChange={(e) => onAuthApiBaseUrlChange(e.target.value)}
              placeholder="例如 http://localhost:8080/prod-api"
              autoComplete="off"
              spellCheck={false}
              disabled={isAuthenticating}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-username">用户名</label>
            <input
              id="login-username"
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              disabled={isAuthenticating}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">密码</label>
            <input
              id="login-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              disabled={isAuthenticating}
            />
          </div>

          {captchaEnabled && (
            <div className="login-field">
              <span className="login-captcha-label" id="login-captcha-label">验证码</span>
              <div className="login-captcha-row" role="group" aria-labelledby="login-captcha-label">
                <div className="login-captcha-input-wrap">
                  <input
                    id="login-code"
                    type="text"
                    className="input login-captcha-input"
                    value={captchaCode}
                    onChange={(e) => onCaptchaCodeChange(e.target.value)}
                    placeholder="请输入验证码"
                    autoComplete="one-time-code"
                    disabled={isAuthenticating || captchaLoading}
                  />
                </div>
                <button
                  type="button"
                  className="login-captcha-img-wrap"
                  onClick={() => onRefreshCaptcha?.()}
                  disabled={isAuthenticating || captchaLoading || !authApiBaseUrl?.trim()}
                  title="点击刷新验证码"
                  aria-label="刷新验证码"
                >
                  {captchaSrc ? (
                    <img src={captchaSrc} alt="验证码" className="login-captcha-img" />
                  ) : (
                    <span className="login-captcha-placeholder">
                      {captchaLoading ? '加载中…' : '点击获取'}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="login-error">
              {errorMessage}
            </div>
          )}

          <button className="btn-primary login-submit" type="submit" disabled={isAuthenticating}>
            {isAuthenticating ? '登录中...' : '进入工作台'}
          </button>
        </form>


      </div>
    </div>
  );
}

export default LoginScreen;
