import { useEffect, useRef, useState } from 'react';
import type { ActionRunner } from '../application/useAppState';

export function useFileDrop(run: ActionRunner) {
  const [targeted, setTargeted] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    function enter(event: DragEvent) {
      event.preventDefault();
      if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth.current++; setTargeted(true); }
    }
    function over(event: DragEvent) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    function leave(event: DragEvent) { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setTargeted(false); }
    function drop(event: DragEvent) {
      event.preventDefault(); event.stopPropagation(); depth.current = 0; setTargeted(false);
      if (event.dataTransfer?.files.length) void run(() => window.tinyPNG.enqueueFiles([...event.dataTransfer!.files]));
    }
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop);
    };
  }, [run]);

  return targeted;
}
