import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Document } from '../db/documents';
import { folderTableLabel } from '../db/requirements';
import { listAllSubfolders, Subfolder } from '../db/subfolders';
import { buildSubfolderTree, SubfolderNode } from '../lib/subfolderTree';

// Every client's folder structure in one place.
//
// The document list answers "what came in"; this answers "where does everything
// live". Client, then folder, then subfolders as deep as they go — the same
// shape a client sees, so staff looking for a file can follow the same path the
// client would describe.
//
// Built from the documents themselves rather than from a folder table: a folder
// with nothing in it is not somewhere anyone is looking for a file. Subfolders
// are the exception — an empty one was made deliberately and is where the next
// file is going, so those are drawn from the subfolder list.

interface Props {
  documents: Document[];
  /** Opens a document, using whatever the parent already does with one. */
  onOpen: (doc: Document) => void;
}

/** Everything a client has, grouped the way they would look for it. */
interface ClientNode {
  email: string;
  folders: FolderNode[];
  total: number;
}
interface FolderNode {
  table: string;
  label: string;
  /** Files sitting in the folder itself. */
  loose: Document[];
  subs: SubTreeNode[];
  total: number;
}
interface SubTreeNode {
  sub: SubfolderNode;
  files: Document[];
  children: SubTreeNode[];
  /** This folder and everything under it. */
  total: number;
}

export function AllClientFoldersView({ documents, onOpen }: Props) {
  const [subfolders, setSubfolders] = useState<Subfolder[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => { listAllSubfolders().then(setSubfolders); }, []);

  const toggle = useCallback((key: string) => setOpen(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  }), []);

  const tree = useMemo<ClientNode[]>(() => {
    if (!subfolders) return [];
    const q = query.trim().toLowerCase();

    // Search matches a file, a folder or a client, and keeps whatever branch
    // leads to the match — a name three levels down is no use if the two
    // folders above it are filtered away.
    const matches = (d: Document) => !q
      || (d.name ?? '').toLowerCase().includes(q)
      || (d.email ?? '').toLowerCase().includes(q);

    const byClient = new Map<string, Document[]>();
    documents.forEach(d => {
      const email = d.email ?? 'Unknown';
      const list = byClient.get(email);
      if (list) list.push(d); else byClient.set(email, [d]);
    });

    const clients: ClientNode[] = [];
    byClient.forEach((docs, email) => {
      const clientMatches = !q || email.toLowerCase().includes(q);
      const kept = clientMatches ? docs : docs.filter(matches);
      if (kept.length === 0) return;

      const byTable = new Map<string, Document[]>();
      kept.forEach(d => {
        const table = d.document_type ?? 'unknown';
        const list = byTable.get(table);
        if (list) list.push(d); else byTable.set(table, [d]);
      });

      const folders: FolderNode[] = [];
      byTable.forEach((tableDocs, table) => {
        // This client's subfolders in this folder. The legacy shared rows have
        // no owner and belong to everyone.
        const mine = subfolders.filter(sf =>
          sf.parent_table === table && (sf.owner_email === email || sf.owner_email == null));

        const build = (nodes: SubfolderNode[]): SubTreeNode[] => nodes.map(node => {
          const children = build(node.children);
          const files = tableDocs.filter(d => d.subfolder_id === node.id);
          return {
            sub: node,
            files,
            children,
            total: files.length + children.reduce((sum, c) => sum + c.total, 0),
          };
        });
        const subs = build(buildSubfolderTree(mine));
        const filedIds = new Set(mine.map(sf => sf.id));
        const loose = tableDocs.filter(d => !d.subfolder_id || !filedIds.has(d.subfolder_id));

        folders.push({
          table,
          label: folderTableLabel(table),
          loose,
          subs,
          total: tableDocs.length,
        });
      });

      folders.sort((a, b) => a.label.localeCompare(b.label));
      clients.push({ email, folders, total: kept.length });
    });

    return clients.sort((a, b) => a.email.localeCompare(b.email));
  }, [documents, subfolders, query]);

  if (subfolders == null) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const renderFile = (doc: Document, depth: number) => (
    <TouchableOpacity
      key={doc.id}
      style={[s.row, { paddingLeft: 14 + depth * 16 }]}
      onPress={() => onOpen(doc)}
      activeOpacity={0.7}
    >
      <Ionicons name="document-text-outline" size={15} color={Colors.textMuted} />
      <Text style={s.fileName} numberOfLines={1}>{doc.file_name || doc.name}</Text>
      {(doc.approval_status ?? 'approved') === 'pending' && (
        <View style={s.pendingDot} />
      )}
    </TouchableOpacity>
  );

  const renderSub = (node: SubTreeNode, keyPrefix: string, depth: number): React.ReactNode => {
    const key = `${keyPrefix}/${node.sub.id}`;
    const isOpen = open.has(key);
    return (
      <View key={key}>
        <TouchableOpacity
          style={[s.row, { paddingLeft: 14 + depth * 16 }]}
          onPress={() => toggle(key)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isOpen ? 'chevron-down' : 'chevron-forward'}
            size={13}
            color={Colors.textMuted}
          />
          <Ionicons name={isOpen ? 'folder-open' : 'folder'} size={15} color={Colors.primaryDark} />
          <Text style={s.folderName} numberOfLines={1}>{node.sub.name}</Text>
          <Text style={s.count}>{node.total}</Text>
        </TouchableOpacity>
        {isOpen && (
          <>
            {node.children.map(child => renderSub(child, key, depth + 1))}
            {node.files.map(d => renderFile(d, depth + 1))}
            {node.total === 0 && (
              <Text style={[s.empty, { paddingLeft: 14 + (depth + 1) * 16 }]}>Empty</Text>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
        <TextInput
          style={[s.searchInput, { outlineWidth: 0 } as any]}
          placeholder="Search a client, folder or file…"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {tree.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="folder-outline" size={34} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>{query ? 'Nothing matches that' : 'No documents yet'}</Text>
          </View>
        ) : tree.map(client => {
          const cKey = client.email;
          const cOpen = open.has(cKey);
          return (
            <View key={cKey} style={s.clientCard}>
              <TouchableOpacity style={s.clientRow} onPress={() => toggle(cKey)} activeOpacity={0.7}>
                <Ionicons
                  name={cOpen ? 'chevron-down' : 'chevron-forward'}
                  size={14}
                  color={Colors.textSecondary}
                />
                <Ionicons name="person-circle-outline" size={18} color={Colors.primaryDark} />
                <Text style={s.clientName} numberOfLines={1}>{client.email}</Text>
                <Text style={s.clientCount}>{client.total}</Text>
              </TouchableOpacity>

              {cOpen && client.folders.map(folder => {
                const fKey = `${cKey}/${folder.table}`;
                const fOpen = open.has(fKey);
                return (
                  <View key={fKey}>
                    <TouchableOpacity
                      style={[s.row, { paddingLeft: 14 + 16 }]}
                      onPress={() => toggle(fKey)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={fOpen ? 'chevron-down' : 'chevron-forward'}
                        size={13}
                        color={Colors.textMuted}
                      />
                      <Ionicons name={fOpen ? 'folder-open' : 'folder'} size={15} color={Colors.primary} />
                      <Text style={s.folderName} numberOfLines={1}>{folder.label}</Text>
                      <Text style={s.count}>{folder.total}</Text>
                    </TouchableOpacity>
                    {fOpen && (
                      <>
                        {folder.subs.map(node => renderSub(node, fKey, 2))}
                        {folder.loose.map(d => renderFile(d, 2))}
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { color: Colors.textMuted, fontSize: 13.5 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
    marginHorizontal: 16, marginTop: 12,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: Colors.textPrimary },
  body: { padding: 16, gap: 10 },

  clientCard: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, overflow: 'hidden',
  },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  clientName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  clientCount: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingRight: 14, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  folderName: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
  fileName: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  count: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.notViewed },
  empty: { fontSize: 11.5, color: Colors.textMuted, paddingVertical: 8, paddingRight: 14 },
});
