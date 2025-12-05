import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSession } from '../context/session-context'

export function AuthScreens() {
  const { actor, isLoading, challengeId } = useSession()

  if (isLoading) {
    return <div className="loading-screen">Loading session…</div>
  }

  if (actor && !challengeId) {
    return null
  }

  return <div className="auth-shell">{challengeId ? <OtpStep /> : <LoginStep />}</div>
}

function LoginStep() {
  const { login, error } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string>()

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setLocalError(undefined)
    try {
      await login(username, password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-panel" onSubmit={onSubmit}>
      <h2>Control Plane Console</h2>
      <p>Enter your console credentials to receive a verification code.</p>
      <label>
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {localError && <div className="callout error">{localError}</div>}
      {error && <div className="callout error">{error}</div>}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? 'Requesting code…' : 'Send verification code'}
      </button>
    </form>
  )
}

function OtpStep() {
  const { verifyOtp, challengeExpiresAt, devOtp, error } = useSession()
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string>()
  const expiresLabel = useMemo(() => {
    if (!challengeExpiresAt) return ''
    const date = new Date(challengeExpiresAt)
    return Number.isNaN(date.getTime()) ? '' : `Expires ${date.toLocaleTimeString()}`
  }, [challengeExpiresAt])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(undefined)
    if (otp.length !== 6) {
      setLocalError('Enter the six-digit code')
      return
    }
    setSubmitting(true)
    try {
      await verifyOtp(otp)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to verify code')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (devOtp) {
      setOtp(devOtp)
    }
  }, [devOtp])

  const handleOtpChange = (value: string) => {
    // Keep only digits and cap at 6 characters to avoid pattern errors from pasted text
    const digitsOnly = value.replace(/\D+/g, '').slice(0, 6)
    setOtp(digitsOnly)
  }

  return (
    <form className="auth-panel" onSubmit={onSubmit}>
      <h2>Enter Verification Code</h2>
      <p>Check your secure channel for the six-digit code.</p>
      <label>
        <span>One-time code</span>
        <input
          value={otp}
          onChange={(e) => handleOtpChange(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
      </label>
      {expiresLabel && <p className="expires-label">{expiresLabel}</p>}
      {error && <div className="callout error">{error}</div>}
      {localError && <div className="callout error">{localError}</div>}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? 'Verifying…' : 'Verify code'}
      </button>
    </form>
  )
}