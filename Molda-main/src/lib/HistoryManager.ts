/* src/lib/HistoryManager.ts
 * Histórico simples por snapshots (toJSON/loadFromJSON) com suporte a transações leves.
 */
export type HistoryConfig = {
  limit?: number;
  snapshot: () => string;               // retorna JSON string do estado atual
  restore: (snap: string) => Promise<void> | void; // restaura a partir do snapshot
};

export default class HistoryManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private limit: number;
  private blocked = false; // evita feedback ao restaurar

  constructor(private cfg: HistoryConfig) {
    this.limit = Math.max(1, cfg.limit ?? 50);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Adiciona o estado atual ao histórico (zera o redo). Evita entradas idênticas consecutivas. */
  push(_label?: string) {
    if (this.blocked) return;
    const snap = this.cfg.snapshot();
    const last = this.undoStack[this.undoStack.length - 1];
    if (last === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo() { return this.undoStack.length > 1; } // precisa de pelo menos 2 estados
  canRedo() { return this.redoStack.length > 0; }

  async undo() {
    if (!this.canUndo()) return;
    const current = this.undoStack.pop()!;               // estado atual sai para o redo
    const prev = this.undoStack[this.undoStack.length - 1];
    this.redoStack.push(current);
    this.blocked = true;
    try {
      await this.cfg.restore(prev);
    } finally {
      this.blocked = false;
    }
  }

  async redo() {
    if (!this.canRedo()) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    this.blocked = true;
    try {
      await this.cfg.restore(next);
    } finally {
      this.blocked = false;
    }
  }

  /** Captura um estado inicial (ex.: após init ou load). */
  captureInitial() {
    const snap = this.cfg.snapshot();
    this.undoStack = [snap];
    this.redoStack = [];
  }
}
