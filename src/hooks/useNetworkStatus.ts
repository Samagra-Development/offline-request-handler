import { useState, useEffect } from 'react';

const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState<any>(null);

  useEffect(() => {
    //@ts-ignore
    let intervalId;

    const checkConnectivity = async () => {
      const isOnline = (await import('is-online')).default;
      const onlineStatus = await isOnline();

      setIsConnected(onlineStatus);
    };

    intervalId = setInterval(checkConnectivity, 10000); // Check every 10 seconds

    // Initial check
    checkConnectivity();

    //@ts-ignore
    return () => clearInterval(intervalId);
  }, []);

  return isConnected;
};

export default useNetworkStatus;
