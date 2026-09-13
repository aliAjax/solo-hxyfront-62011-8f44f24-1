import { useSyncExternalStore } from "react";
import type { AppData } from "./types";
import { loadData, saveData } from "./storage";
import type { HorseInput } from "./domain";
import {
  createHorse,
  createVisit,
  deleteHorse,
  deleteVisit,
  updateHorse,
  updateVisit,
} from "./domain";
import type { Visit } from "./types";

let data: AppData = loadData();
const listeners = new Set<() => void>();

function emit(ok: boolean) {
  if (ok) listeners.forEach((l) => l());
}

function commit(next: AppData) {
  // 先写内存保证交互响应，持久化失败时给出提示（saveData 内部会 alert）
  data = next;
  const ok = saveData(next);
  emit(ok);
}

export const store = {
  getSnapshot: () => data,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  addHorse(input: HorseInput) {
    commit(createHorse(data, input));
  },
  editHorse(id: string, patch: Partial<HorseInput>) {
    commit(updateHorse(data, id, patch));
  },
  removeHorse(id: string) {
    commit(deleteHorse(data, id));
  },

  addVisit(visit: Visit) {
    commit(createVisit(data, visit));
  },
  editVisit(visit: Visit) {
    commit(updateVisit(data, visit));
  },
  removeVisit(visitId: string) {
    commit(deleteVisit(data, visitId));
  },
};

export function useStore(): AppData {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
