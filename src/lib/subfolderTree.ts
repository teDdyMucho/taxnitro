import type { Subfolder } from '../db/subfolders';

// Shaping a flat list of subfolders into the tree it describes.
//
// Pure, and in lib rather than db, because three screens draw this tree and a
// rule about shape should be checkable without a database client attached.

/** A subfolder with its own children, for drawing the tree. */
export interface SubfolderNode extends Subfolder {
  children: SubfolderNode[];
}

/**
 * The flat list as a tree, siblings in name order.
 *
 * A row whose parent is missing — deleted, or filtered out of this list — is
 * treated as top-level rather than dropped, so a file inside it can still be
 * reached.
 */
export function buildSubfolderTree(rows: Subfolder[]): SubfolderNode[] {
  const byId = new Map<string, SubfolderNode>(rows.map(r => [r.id, { ...r, children: [] }]));
  const roots: SubfolderNode[] = [];
  byId.forEach(node => {
    const parent = node.parent_subfolder_id ? byId.get(node.parent_subfolder_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sort = (list: SubfolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach(n => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** The folder and everything above it, outermost first — for a breadcrumb. */
export function subfolderPath(rows: Subfolder[], id: string | null): Subfolder[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  const path: Subfolder[] = [];
  let hop = id ? byId.get(id) : undefined;
  // Bounded, so a ring in the data cannot hang the screen drawing it.
  while (hop && path.length < 64) {
    path.unshift(hop);
    hop = hop.parent_subfolder_id ? byId.get(hop.parent_subfolder_id) : undefined;
  }
  return path;
}

/** Every folder inside this one, at any depth — what a delete would take. */
export function descendantIds(rows: Subfolder[], id: string): string[] {
  const out: string[] = [];
  const walk = (parentId: string) => {
    rows.filter(r => r.parent_subfolder_id === parentId).forEach(child => {
      out.push(child.id);
      walk(child.id);
    });
  };
  walk(id);
  return out;
}
