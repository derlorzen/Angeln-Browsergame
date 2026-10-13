// Binärer Min-Heap für Knotenindizes mit Prioritäten (für A*).
export class MinHeap {
  private ids: number[] = [];
  private pr: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  clear(): void {
    this.ids.length = 0;
    this.pr.length = 0;
  }
  push(id: number, p: number): void {
    const ids = this.ids, pr = this.pr;
    let i = ids.length;
    ids.push(id);
    pr.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= p) break;
      ids[i] = ids[parent];
      pr[i] = pr[parent];
      i = parent;
    }
    ids[i] = id;
    pr[i] = p;
  }
  pop(): number {
    const ids = this.ids, pr = this.pr;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pr.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && pr[r] < pr[l] ? r : l;
        if (pr[c] >= lastP) break;
        ids[i] = ids[c];
        pr[i] = pr[c];
        i = c;
      }
      ids[i] = lastId;
      pr[i] = lastP;
    }
    return top;
  }
}
