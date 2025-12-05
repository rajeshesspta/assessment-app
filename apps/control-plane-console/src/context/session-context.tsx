import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fetchSession, login as loginApi, logout, verifyOtp as verifyOtpApi } from '../api/controlPlaneClient'

interface Actor {
  username: string
}

interface SessionValue {
  actor: Actor | null
  isLoading: boolean
  challengeId: string | null
  challengeExpiresAt: string | null
  devOtp?: string
  login: (username: string, password: string) => Promise<void>
  verifyOtp: (otp: string) => Promise<void>
  signOut: () => Promise<void>
  error?: string
}

const SessionContext = createContext<SessionValue | undefined>(undefined)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [challenge, setChallenge] = useState<{ id: string; expiresAt: string; devOtp?: string } | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let mounted = true
    fetchSession()
      .then((session) => {
        if (mounted) {
          setActor(session?.actor ?? null)
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  const login = async (username: string, password: string) => {
    setError(undefined)
    try {
      const nextChallenge = await loginApi(username, password)
      setChallenge({ id: nextChallenge.challengeId, expiresAt: nextChallenge.expiresAt, devOtp: nextChallenge.devOtp })
    } catch (err) {
      setChallenge(null)
      setError(err instanceof Error ? err.message : 'Failed to start login')
      throw err
    }
  }

  const verifyOtp = async (otp: string) => {
    if (!challenge) {
      throw new Error('No active challenge')
    }
    setError(undefined)
    try {
      const session = await verifyOtpApi(challenge.id, otp)
      setActor(session.actor)
      setChallenge(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP')
      throw err
    }
  }

  const signOut = async () => {
    await logout()
    setActor(null)
    setChallenge(null)
  }

  const value = useMemo<SessionValue>(
    () => ({
      actor,
      isLoading,
      challengeId: challenge?.id ?? null,
      challengeExpiresAt: challenge?.expiresAt ?? null,
      devOtp: challenge?.devOtp,
      login,
      verifyOtp,
      signOut,
      error,
    }),
    [actor, challenge, isLoading, error],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return ctx
}
