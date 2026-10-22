import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { MediaItem } from "../types/media";
import { tauri } from "../commands/tauri";

interface VaultState {
  // State
  enabled: boolean;
  unlocked: boolean;
  locked: boolean;
  autoLockMinutes: number;
  items: MediaItem[];
  unlockMethod: "password" | "touchid" | "both";

  // Actions
  loadStatus: () => Promise<void>;
  unlock: (password?: string, biometric?: boolean) => Promise<void>;
  lock: () => Promise<void>;
  addItems: (itemIds: string[]) => Promise<void>;
  removeItems: (itemIds: string[]) => Promise<void>;
  toggleEnabled: (enabled: boolean) => Promise<void>;
  setAutoLock: (minutes: number) => Promise<void>;
  setUnlockMethod: (method: "password" | "touchid" | "both") => Promise<void>;
}

export const useVaultStore = create<VaultState>()(
  devtools(
    (set, get) => ({
      enabled: false,
      unlocked: false,
      locked: true,
      autoLockMinutes: 5,
      items: [],
      unlockMethod: "both",

      loadStatus: async () => {
        try {
          const status = await tauri.vault.getStatus();
          set({ enabled: status.enabled, locked: status.locked, unlocked: !status.locked, autoLockMinutes: status.autoLockMinutes });
          if (!status.locked) {
            const items = await tauri.vault.listItems();
            set({ items });
          }
        } catch (e) {
          console.error("Failed to load vault status:", e);
        }
      },

      unlock: async (password, biometric = false) => {
        try {
          const session = await tauri.vault.unlock(password ?? null, biometric);
          const items = await tauri.vault.listItems();
          set({ unlocked: session.unlocked, locked: !session.unlocked, items });
        } catch (e) {
          console.error("Vault unlock failed:", e);
          throw e;
        }
      },

      lock: async () => {
        try {
          await tauri.vault.lock();
          set({ unlocked: false, locked: true, items: [] });
        } catch (e) {
          console.error("Vault lock failed:", e);
        }
      },

      addItems: async (itemIds) => {
        try {
          await tauri.vault.addItems(itemIds);
          const items = await tauri.vault.listItems();
          set({ items });
        } catch (e) {
          console.error("Failed to add to vault:", e);
        }
      },

      removeItems: async (itemIds) => {
        try {
          await tauri.vault.removeItems(itemIds);
          const items = await tauri.vault.listItems();
          set({ items });
        } catch (e) {
          console.error("Failed to remove from vault:", e);
        }
      },

      toggleEnabled: async (enabled) => {
        // TODO: Implement via settings
        set({ enabled });
      },

      setAutoLock: async (minutes) => {
        // TODO: Implement via settings
        set({ autoLockMinutes: minutes });
      },

      setUnlockMethod: async (method) => {
        set({ unlockMethod: method });
      },
    }),
    { name: "vault-store" }
  )
);

export const useVaultEnabled = () => useVaultStore((s) => s.enabled);
export const useVaultUnlocked = () => useVaultStore((s) => s.unlocked);
export const useVaultItems = () => useVaultStore((s) => s.items);
export const useVaultAutoLock = () => useVaultStore((s) => s.autoLockMinutes);