import { createContext, useContext } from 'react';

export const UploadContext = createContext(null);
export const useUpload = () => useContext(UploadContext);
