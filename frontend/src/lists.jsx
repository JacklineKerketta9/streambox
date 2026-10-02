import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const ListContext = createContext(null);
export const useList = () => useContext(ListContext);

export function ListProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const itemsRef = useRef([]);
  const revisionRef = useRef(0);
  const requestQueueRef = useRef(Promise.resolve());

  const replaceItems = (next) => {
    itemsRef.current = next;
    setItems(next);
  };

  const load = async () => {
    const revision = revisionRef.current;
    try {
      const data = await api('/my-list');
      if (revision === revisionRef.current) replaceItems(data.items);
    } catch { /* keep the current view if the API is temporarily unavailable */ }
    if (revision === revisionRef.current) setLoaded(true);
  };

  useEffect(() => { load(); }, []);

  const toggle = (id, title) => {
    const wasSaved = itemsRef.current.some((item) => item.id === id);
    const version = ++revisionRef.current;
    const next = wasSaved
      ? itemsRef.current.filter((item) => item.id !== id)
      : title ? [title, ...itemsRef.current] : itemsRef.current;
    replaceItems(next);

    const request = requestQueueRef.current.then(() => api(
      wasSaved ? `/my-list/${id}` : '/my-list',
      { method: wasSaved ? 'DELETE' : 'POST', body: wasSaved ? undefined : { titleId: id } }
    ));
    requestQueueRef.current = request.catch(async () => {
      if (version === revisionRef.current) await load();
    });
    return request;
  };

  const has = (id) => items.some((item) => item.id === id);
  return <ListContext.Provider value={{ items, loaded, has, load, toggle }}>{children}</ListContext.Provider>;
}
