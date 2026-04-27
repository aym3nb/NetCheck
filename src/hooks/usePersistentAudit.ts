import { useState, useCallback } from "react";

const STORAGE_KEY = "netcheck-audit";

interface PersistentAuditState {
  isNextDNSVerified: boolean;
  isDNSLeakVerified: boolean;
  hasDNSLeak: boolean; // true if user reported a potential leak
  lastAuditTimestamp: string | null;
}

const DEFAULT_STATE: PersistentAuditState = {
  isNextDNSVerified: false,
  isDNSLeakVerified: false,
  hasDNSLeak: false,
  lastAuditTimestamp: null,
};

function loadFromStorage(): PersistentAuditState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<PersistentAuditState>) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: PersistentAuditState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function usePersistentAudit() {
  const [auditState, setAuditState] = useState<PersistentAuditState>(loadFromStorage);

  const setNextDNSVerified = useCallback((verified: boolean) => {
    setAuditState((prev) => {
      const next: PersistentAuditState = {
        ...prev,
        isNextDNSVerified: verified,
        lastAuditTimestamp: new Date().toISOString(),
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const setDNSLeakVerified = useCallback((verified: boolean, hasLeak: boolean) => {
    setAuditState((prev) => {
      const next: PersistentAuditState = {
        ...prev,
        isDNSLeakVerified: verified,
        hasDNSLeak: hasLeak,
        lastAuditTimestamp: new Date().toISOString(),
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const resetAudit = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setAuditState(DEFAULT_STATE);
  }, []);

  return {
    isNextDNSVerified: auditState.isNextDNSVerified,
    isDNSLeakVerified: auditState.isDNSLeakVerified,
    hasDNSLeak: auditState.hasDNSLeak,
    lastAuditTimestamp: auditState.lastAuditTimestamp,
    setNextDNSVerified,
    setDNSLeakVerified,
    resetAudit,
  };
}
