"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthView } from "@/components/auth-view";
import { ApiRequestError, fetchApi, sessionResponseSchema, type PublicUser } from "@/components/client-api";
import { Dashboard } from "@/components/dashboard";
import { Brand, Icon } from "@/components/ui";
const fetchSession = async (): Promise<PublicUser> => {
  const response = await fetchApi("/api/auth/session", sessionResponseSchema);
  return response.user;
};


export function LifestyleApp() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);

  async function checkSession() {
    setCheckingSession(true);
    setStartupError(null);
    try {
      setUser(await fetchSession());
    } catch (caught) {
      if (!(caught instanceof ApiRequestError && caught.status === 401)) {
        setStartupError(caught instanceof Error ? caught.message : "The app could not start");
      }
      setUser(null);
    } finally {
      setCheckingSession(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchSession()
      .then((sessionUser) => {
        if (active) setUser(sessionUser);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (!(caught instanceof ApiRequestError && caught.status === 401)) {
          setStartupError(caught instanceof Error ? caught.message : "The app could not start");
        }
        setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signedOut = useCallback(() => setUser(null), []);

  if (checkingSession) {
    return <main className="boot-screen"><Brand /><div className="boot-pulse"><Icon name="activity" size={24} /></div><p>Opening your training workspace</p></main>;
  }

  if (startupError) {
    return <main className="boot-screen"><Brand /><div className="boot-error"><Icon name="activity" size={28} /></div><h1>Connection interrupted</h1><p>{startupError}</p><button className="primary-button" type="button" onClick={() => void checkSession()}>Try again</button></main>;
  }

  return user ? <Dashboard user={user} onSignedOut={signedOut} /> : <AuthView onAuthenticated={setUser} />;
}
