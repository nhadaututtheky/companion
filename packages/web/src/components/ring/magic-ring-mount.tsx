"use client";
import { useEffect } from "react";
import { MagicRing } from "./magic-ring";
import { useRingStore } from "@/lib/stores/ring-store";
import { api } from "@/lib/api-client";

/** Client wrapper — handles SSR-safe rehydration + stale state validation */
export function MagicRingMount() {
  useEffect(() => {
    useRingStore.persist.rehydrate();

    const { mode, debateChannelId, linkedSessionIds } = useRingStore.getState();

    // Validate persisted debate channel still exists
    if (mode === "debate" && debateChannelId) {
      api.channels.get(debateChannelId).catch(() => {
        useRingStore.getState().setDebateChannelId(null);
        useRingStore.getState().setMode("broadcast");
      });
    } else if (mode === "debate" && !debateChannelId) {
      useRingStore.getState().setMode("broadcast");
    }

    // Prune linked sessions that no longer exist on server
    if (linkedSessionIds.length > 0) {
      api.sessions.list().then((res) => {
        const activeIds = new Set(
          (res.data.sessions as Array<{ id: string }>).map((s) => s.id),
        );
        const store = useRingStore.getState();
        for (const sid of store.linkedSessionIds) {
          if (!activeIds.has(sid)) {
            store.unlinkSession(sid);
          }
        }
      }).catch(() => {
        // Server not reachable — keep stale IDs, will resolve on next poll
      });
    }
  }, []);

  return <MagicRing />;
}
