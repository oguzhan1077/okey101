'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Venue {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  welcome_message?: string;
  is_active: boolean;
}

interface VenueContextType {
  venue: Venue | null;
  setVenue: (venue: Venue | null) => void;
  isLoading: boolean;
}

const VenueContext = createContext<VenueContextType>({
  venue: null,
  setVenue: () => {},
  isLoading: true,
});

export function VenueProvider({ children }: { children: ReactNode }) {
  const [venue, setVenueState] = useState<Venue | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // localStorage'den venue bilgisini al
    const stored = localStorage.getItem('currentVenue');
    if (stored) {
      try {
        const parsedVenue = JSON.parse(stored);
        setVenueState(parsedVenue);
      } catch (error) {
        console.error('Failed to parse venue from localStorage:', error);
        localStorage.removeItem('currentVenue');
      }
    }
    setIsLoading(false);
  }, []);

  const setVenue = (newVenue: Venue | null) => {
    setVenueState(newVenue);
    if (newVenue) {
      localStorage.setItem('currentVenue', JSON.stringify(newVenue));
    } else {
      localStorage.removeItem('currentVenue');
    }
  };

  return (
    <VenueContext.Provider value={{ venue, setVenue, isLoading }}>
      {children}
    </VenueContext.Provider>
  );
}

export const useVenue = () => {
  const context = useContext(VenueContext);
  if (context === undefined) {
    throw new Error('useVenue must be used within a VenueProvider');
  }
  return context;
};

