'use client';

import { Chat } from '@/components/chat'
import { generateId } from 'ai'
import { useEffect, useState } from 'react';
import type { Model } from '@/lib/types/models';

export default function Page() {
  const id = generateId()
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    // Fetch models client-side
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.models)) {
          setModels(data.models);
        }
      })
      .catch(err => {
        console.error('Failed to load models:', err);
        setModels([]);
      });
  }, []);

  return <Chat id={id} models={models} />
}
