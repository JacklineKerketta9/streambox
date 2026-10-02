import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const ListContext = createContext(null);
export const useList = () => useContext(ListContext);

// Tracks which titles are in "My List" so every card can show + / ✓ instantly.
export function ListProvider({ children }) {
  const [ids, setIds] = useState(new Set());

  const load = () =>
    api('/my-list')
      .then((d) => setIds(new Set(d.items.map((t) => t.id))))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const toggle = async (id) => {
    const has = ids.has(id);
    setIds((prev) => {
      const next = new Set(prev);
      if (has) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await api(has ? `/my-list/${id}` : '/my-list', { method: has ? 'DELETE' : 'POST', body: has ? undefined : { titleId: id } });
    } catch {
      load(); // roll back to server truth
    }
  };

  return <ListContext.Provider value={{ has: (id) => ids.has(id), toggle }}>{children}</ListContext.Provider>;
}
