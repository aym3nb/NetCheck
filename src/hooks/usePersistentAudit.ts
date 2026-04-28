import { useState, useCallback } from "react";
import type { AuditEntry } from "@/hooks/useNetDiagnostics";

const STORAGE_KEY = "netcheck-audit";

interface PersistentAuditState {
  isNextDNSVerified: boolean;
  isDNSLeakVerified: boolean;
  hasDNSLeak: boolean; // true if user reported a potential leak
  lastAuditTimestamp: string | null;
  manualAuditEntries: AuditEntry[];
}

const DEFAULT_STATE: PersistentAuditState = {
  isNextDNSVerified: false,
  isDNSLeakVerified: false,
  hasDNSLeak: false,
  lastAuditTimestamp: null,
  manualAuditEntries: [],
};

function isAuditEntry(val: unknown): val is AuditEntry {
  if (typeof val !== "object" || val === null) return false;
  const v = val as Record<string, unknown>;
  return typeof v.timestamp === "string" && typeof v.event === "string" && typeof v.statusCode === "string";
}

function loadFromStorage(): PersistentAuditState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_STATE;
    const p = parsed as Record<string, unknown>;
    const entries = Array.isArray(p.manualAuditEntries) ? p.manualAuditEntries.filter(isAuditEntry) : [];
    return {
      isNextDNSVerified: typeof p.isNextDNSVerified === "boolean" ? p.isNextDNSVerified : DEFAULT_STATE.isNextDNSVerified,
      isDNSLeakVerified: typeof p.isDNSLeakVerified === "boolean" ? p.isDNSLeakVerified : DEFAULT_STATE.isDNSLeakVerified,
      hasDNSLeak: typeof p.hasDNSLeak === "boolean" ? p.hasDNSLeak : DEFAULT_STATE.hasDNSLeak,
      lastAuditTimestamp: typeof p.lastAuditTimestamp === "string" ? p.lastAuditTimestamp : DEFAULT_STATE.lastAuditTimestamp,
      manualAuditEntries: entries,
    };
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

function makeManualEntry(event: string, statusCode: string): AuditEntry {
  return { timestamp: new Date().toISOString(), event: `[Manual] ${event}`, statusCode };
}

export function usePersistentAudit() {
  const [auditState, setAuditState] = useState<PersistentAuditState>(loadFromStorage);

  const setNextDNSVerified = useCallback((verified: boolean) => {
    const entry = makeManualEntry(
      `NextDNS state verified by user: ${verified ? "Active" : "Inactive"}.`,
      verified ? "Verified" : "Not Verified"
    );
    setAuditState((prev) => {
      const next: PersistentAuditState = {
        ...prev,
        isNextDNSVerified: verified,
        lastAuditTimestamp: entry.timestamp,
        manualAuditEntries: [entry, ...prev.manualAuditEntries].slice(0, 100),
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const setDNSLeakVerified = useCallback((verified: boolean, hasLeak: boolean) => {
    const eventText = hasLeak
      ? "DNS Leak check completed: Potential unauthorized resolvers found."
      : "DNS Leak check completed: No unauthorized resolvers found.";
    const entry = makeManualEntry(eventText, hasLeak ? "Potential Leak" : "Clean");
    setAuditState((prev) => {
      const next: PersistentAuditState = {
        ...prev,
        isDNSLeakVerified: verified,
        hasDNSLeak: hasLeak,
        lastAuditTimestamp: entry.timestamp,
        manualAuditEntries: [entry, ...prev.manualAuditEntries].slice(0, 100),
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
    manualAuditEntries: auditState.manualAuditEntries,
    setNextDNSVerified,
    setDNSLeakVerified,
    resetAudit,
  };
}
