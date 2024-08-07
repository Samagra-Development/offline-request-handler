import React, {
  FC,
  ReactElement,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { DataSyncContext } from './data-sync-context';
import axios from 'axios';
import localForage from 'localforage';
import { omit } from 'underscore';

const api = axios.create();
const RETRY_LIMIT = 0;
const RETRY_DELAY_MS = 1000;
const API_REQUESTS_STORAGE_KEY = 'apiRequests';

import {
  generateUuid,
  getStoredRequests,
  clearStoredRequests,
  setStorage,
  objectToFormData,
  _formDataToObject,
} from './api-helper';
import useNetworkStatus from './hooks/useNetworkStatus';

// Check if window object exists
// const hasWindow = () => {
//   return window && typeof window !== 'undefined';
// };
interface ApiRequest {
  id: string;
  type?: string;
  url: string;
  method: string;
  data?: any;
  isFormdata?: boolean;
  retryCount?: number;
}

type ConfigType = {
  isFormdata?: boolean;
  maxRetry?: number;
  executionOrder?: string[];
  sequentialProcessing?: boolean;
};

export const OfflineSyncProvider: FC<{
  children: ReactElement;
  render?: (status: { isOffline?: boolean; isOnline: boolean }) => ReactNode;
  onStatusChange?: (status: { isOnline: boolean }) => void;
  onCallback?: (data: any) => void;
  toastConfig?: any;
  config?: ConfigType;
}> = ({ children, render, onStatusChange, onCallback, config }) => {
  // Manage state for data, offline status, and online status
  const [data, setData] = useState<Record<string, any>>({});
  const isSyncing = useRef<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    window?.navigator?.onLine ?? true
  );

  const isConnected = useNetworkStatus();
  console.log({ isConnected });
  // Optional: Callback function to handle status change
  useEffect(() => {
    if (isConnected !== null) {
      console.log('Network status:', isConnected ? 'Online' : 'Offline');
      if (isConnected) {
        handleOnline();
      } else {
        handleOffline();
      }
    }
  }, [isConnected]);
  // useEffect(() => {
  //   if (!hasWindow()) {
  //     return;
  //   }
  //   window.addEventListener('online', handleOnline);
  //   window.addEventListener('offline', handleOffline);
  //   return () => {
  //     window.removeEventListener('offline', handleOffline);
  //     window.removeEventListener('online', handleOnline);
  //   };
  // }, []);

  // Event handler for online event
  const handleOnline = useCallback(() => {
    handleEvent(false);
    syncOfflineRequests();
  }, []);

  // Event handler for offline event
  const handleOffline = () => {
    handleEvent(true);
  };

  // Event handler for status change
  const handleEvent = (isOffline = true) => {
    const isOnline = !isOffline;
    onStatusChange?.({ isOnline });
    setIsOnline(isOnline);
  };

  useEffect(() => {
    syncOfflineRequests();
  }, []);

  const saveRequestToOfflineStorage = async (apiConfig: any) => {
    try {
      const storedRequests: Array<any> =
        (await localForage.getItem(API_REQUESTS_STORAGE_KEY)) || [];
      console.log('perform stored', {
        req: storedRequests,
        length: storedRequests.length,
      });
      if (apiConfig?.isFormdata && apiConfig?.data instanceof FormData) {
        // console.log({ apiConfig })
        const newData = await _formDataToObject(apiConfig.data);
        storedRequests.push(
          omit(
            { ...apiConfig, data: newData, type: apiConfig.type },
            'onSuccess'
          )
        );
      } else {
        console.log('Saving request normally');
        storedRequests.push(
          omit({ ...apiConfig, type: apiConfig.type }, 'onSuccess')
        );
      }
      console.log('perform forage after:', { storedRequests });
      const result = await localForage.setItem(
        API_REQUESTS_STORAGE_KEY,
        storedRequests
      );
      console.log('perform forage:', { result });
    } catch (error) {
      console.error('Error saving API request for offline:', error);
    }
  };

  // Function to perform the actual API request and handle retries
  const performRequest = async (config: any): Promise<any> => {
    console.log('Inside performRequest');
    try {
      let response;
      if (config?.isFormdata && !(config?.data instanceof FormData)) {
        const updateConfig = { ...config, data: objectToFormData(config.data) };
        response = await api.request(updateConfig);
      } else {
        response = await api.request(config);
      }

      onCallback && onCallback({ config, data: response, sendRequest });
      return response.data;
    } catch (error) {
      console.log('packageError', { error });
      console.log('Inside performRequest error: ', {
        rc: config.retryCount,
        RETRY_LIMIT,
      });
      if ((config.retryCount ?? 0) < RETRY_LIMIT) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        if (config.retryCount === undefined) {
          config.retryCount = 1;
        } else {
          config.retryCount++;
        }
        return performRequest(config);
      } else {
        // Retry limit reached, save the request to offline storage
        console.log('Saving request to offline storage');
        await saveRequestToOfflineStorage(config);
        return error;
        // throw new Error('Exceeded retry limit, request saved for offline sync.');
      }
    }
  };

  // Function to send the requests to the server and handle offline sync
  const sendRequest = async (config: any) => {
    try {
      config.retryCount = config.retryCount ?? 0;
      config.id = generateUuid();
      return await performRequest(config);
    } catch (error) {
      throw error;
    }
  };

  const processRequestsSequentially = async (
    requests: ApiRequest[],
    executionOrder?: string[]
  ) => {
    const results = [];

    if (executionOrder && executionOrder.length > 0) {
      const requestsByType: Record<string, ApiRequest[]> = {};

      for (const request of requests) {
        const type = request.type || 'default';
        if (!requestsByType[type]) {
          requestsByType[type] = [];
        }
        requestsByType[type].push(request);
      }

      for (const type of executionOrder) {
        const typeRequests = requestsByType[type] || [];
        for (const request of typeRequests) {
          try {
            const result = await performRequest(request);
            results.push({ request, result });
          } catch (error) {
            console.error(`Error processing ${type} request:`, error);
            results.push({ request, error });
          }
        }
      }

      for (const type in requestsByType) {
        if (!executionOrder.includes(type)) {
          for (const request of requestsByType[type]) {
            try {
              const result = await performRequest(request);
              results.push({ request, result });
            } catch (error) {
              console.error(`Error processing ${type} request:`, error);
              results.push({ request, error });
            }
          }
        }
      }
    } else {
      for (const request of requests) {
        try {
          const result = await performRequest(request);
          results.push({ request, result });
        } catch (error) {
          console.error(`Error processing request:`, error);
          results.push({ request, error });
        }
      }
    }

    return results;
  };

  const syncOfflineRequests = async () => {
    if (isSyncing.current) {
      return;
    }
    isSyncing.current = true;
    const storedRequests: any = await getStoredRequests();
    if (!storedRequests || storedRequests.length === 0) {
      isSyncing.current = false;
      return;
    }

    console.log('Inside syncOfflineRequests', storedRequests);
    const requestClone = [...storedRequests];

    try {
      let results;
      if (config?.executionOrder) {
        results = await processRequestsSequentially(
          requestClone,
          config.executionOrder
        );
      } else if (config?.sequentialProcessing) {
        results = await processRequestsSequentially(requestClone);
      } else {
        results = await Promise.all(requestClone.map(performRequest));
      }

      for (const result of results) {
        const request = result.request || result;
        const error = result.error;
        if (!error) {
          const updatedRequests = requestClone.filter(
            sr => sr.id !== request.id
          );
          requestClone.splice(0, requestClone.length, ...updatedRequests);
        } else {
          console.error('Failed to process request:', request, error);
        }
      }
    } catch (error) {
      console.error('Error in syncOfflineRequests:', error);
    } finally {
      await localForage.setItem(API_REQUESTS_STORAGE_KEY, requestClone);
      isSyncing.current = false;
    }
  };

  return (
    <>
      <DataSyncContext.Provider
        value={{
          data,
          setData,
          sendRequest,
          clearStoredRequests,
          getStoredRequests,
          setStorage,
        }}
      >
        {render?.({ isOnline })}
        {children}
      </DataSyncContext.Provider>
    </>
  );
};

// Custom hook to access offline sync context
export const useOfflineSyncContext = () => {
  return useContext(DataSyncContext);
};
