import React, { useEffect, useState } from 'react';
import { Lock, Key, User } from 'lucide-react';
import { api, ensureTenantScope, getAuthToken, setAuthToken } from '../api/client';
import { useToastStore } from '../store/useToastStore';

interface RBACGateProps {
  children: React.ReactNode;
}

type AuthMode = 'login' | 'token';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px 8px 32px',
  background: 'var(--bg-main)',
  border: '1px solid var(--panel-border)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '0.85rem'
};

const AuthForm: React.FC<{ onAuthenticated: () => void }> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const handleLogin = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await api.loginWithPassword(username.trim(), password);
      if (res?.valid && res.token) {
        setAuthToken(res.token);
        await ensureTenantScope();
        showToast('success', 'Welcome', `Signed in as ${res.user?.username || username} (${res.role}).`);
        onAuthenticated();
      } else {
        setErrorMsg('Unexpected server response.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleTokenUnlock = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await api.verifyToken(key);
      // Only an explicit server-side `valid: true` unlocks the gate. Any
      // other truthy shape (username, success flags…) is not proof of
      // privilege and must stay locked out.
      if (res && res.valid === true) {
        setAuthToken(key);
        await ensureTenantScope();
        showToast('success', 'Access Granted', `Unlocked with role: ${res.role || 'unknown'} and an active project scope.`);
        onAuthenticated();
      } else {
        setErrorMsg('Invalid cryptographic token or insufficient privileges.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Verification failed. Connection rejected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--panel-border)', marginBottom: '16px' }}>
        <button
          onClick={() => { setMode('login'); setErrorMsg(null); }}
          style={{
            padding: '8px 12px', border: '0', background: 'none', cursor: 'pointer', font: 'inherit',
            fontSize: '0.85rem', color: mode === 'login' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: mode === 'login' ? '2px solid var(--accent-blue)' : '2px solid transparent'
          }}
        >
          <User size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Connexion
        </button>
        <button
          onClick={() => { setMode('token'); setErrorMsg(null); }}
          style={{
            padding: '8px 12px', border: '0', background: 'none', cursor: 'pointer', font: 'inherit',
            fontSize: '0.85rem', color: mode === 'token' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: mode === 'token' ? '2px solid var(--accent-blue)' : '2px solid transparent'
          }}
        >
          <Key size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Jeton d'accès
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid var(--danger)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '16px' }}>
          {errorMsg}
        </div>
      )}

      {mode === 'login' ? (
        <>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nom d'utilisateur</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && password && handleLogin()}
            placeholder="admin"
            autoFocus
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Mot de passe</label>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && username && password && handleLogin()}
              placeholder="••••••••"
              style={inputStyle}
            />
            <Lock size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          </div>
          <button onClick={handleLogin} disabled={busy || !username || !password} className="gh-btn gh-btn-primary" style={{ width: '100%', padding: '8px 16px', fontWeight: 600 }}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
            Authentification par clé cryptographique ou jeton administrateur.
          </p>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && key && handleTokenUnlock()}
              placeholder="genos_sk_… / jeton admin…"
              autoFocus
              style={inputStyle}
            />
            <Key size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          </div>
          <button onClick={handleTokenUnlock} disabled={busy || !key} className="gh-btn gh-btn-primary" style={{ width: '100%', padding: '8px 16px', fontWeight: 600 }}>
            {busy ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </>
      )}
    </>
  );
};

export const RBAC_Gate: React.FC<RBACGateProps> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // A refreshed Studio must reuse a previously validated local access key or
  // session token. Without this, every reload incorrectly presents the login
  // gate again.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setChecking(false);
      return;
    }
    api.verifyToken(token)
      .then(async (result) => {
        if (result?.valid) {
          await ensureTenantScope();
          setLocked(false);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleAuthenticated = () => {
    setLocked(false);
  };

  const authCard = (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '24px', width: '420px', boxShadow: '0 16px 32px rgba(0,0,0,0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', marginBottom: '12px' }}>
        <Lock size={18} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>GenOS Studio — Authentification</h3>
      </div>
      <AuthForm onAuthenticated={handleAuthenticated} />
      {!dismissed && (
        <button
          onClick={() => setDismissed(true)}
          style={{ marginTop: '12px', width: '100%', border: '0', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', font: 'inherit', fontSize: '0.78rem' }}
        >
          Continuer en lecture seule (anonyme)
        </button>
      )}
    </div>
  );

  if (checking) return <>{children}</>;

  if (!locked) return <>{children}</>;

  // Anonymous read-only browsing was explicitly chosen: only gate elevated
  // actions through the modal.
  if (dismissed) {
    return (
      <>
        {/* Capture phase runs before the wrapped child's own onClick, so the
            gate can actually swallow clicks on locked controls instead of
            letting the action fire first and merely opening this modal. */}
        <div onClickCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDismissed(false);
        }}>
          {children}
        </div>
      </>
    );
  }

  // No valid session yet: present the sign-in experience before anything else.
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {authCard}
    </div>
  );
};
