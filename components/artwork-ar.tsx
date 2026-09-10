'use client';

import { useEffect, useRef, useState } from 'react';
import type { Artwork } from '@/lib/gallery/data';

let viewerReady: Promise<void> | undefined;
function loadViewer() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!viewerReady) {
    viewerReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/vendor/model-viewer-4.3.1.min.js';
      script.onload = () => {
        if (customElements.get('model-viewer')) resolve();
        else {
          script.remove();
          viewerReady = undefined;
          reject(new Error('The 3D viewer did not initialize.'));
        }
      };
      script.onerror = () => {
        script.remove();
        viewerReady = undefined;
        reject(new Error('The 3D viewer could not load.'));
      };
      document.head.appendChild(script);
    });
  }
  return viewerReady;
}

export default function ArtworkAR({ work }: { work: Artwork }) {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Preparing your framed artwork…');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let viewer: HTMLElement | undefined;
    setFailed(false);
    setMessage('Preparing your framed artwork…');
    const failure = () => {
      if (cancelled) return;
      setFailed(true);
      setMessage('The 3D preview could not load. Please try again.');
    };
    void loadViewer()
      .then(() => {
        if (cancelled || !host.current) return;
        viewer = document.createElement('model-viewer');
        const attributes: Record<string, string> = {
          src: `/ar/${work.id}.glb`,
          'ios-src': `/ar/${work.id}.usdz`,
          alt: `Framed Codex billboard${work.handle ? ` by @${work.handle}` : ''}`,
          ar: '',
          'ar-modes': 'webxr scene-viewer quick-look',
          'ar-placement': 'wall',
          'ar-scale': 'auto',
          'camera-controls': '',
          'camera-orbit': '0deg 80deg 2.5m',
          'field-of-view': '30deg',
          'touch-action': 'pan-y',
          'shadow-intensity': '0.65',
          'environment-image': 'neutral',
          loading: 'eager',
          reveal: 'auto',
        };
        for (const [key, value] of Object.entries(attributes))
          viewer.setAttribute(key, value);
        // The component reveals this slot only when it detects an AR launch route.
        // Its own click handler launches AR directly within the user's gesture.
        const start = document.createElement('button');
        start.type = 'button';
        start.slot = 'ar-button';
        start.className = 'gold-button ar-start';
        start.textContent = 'Start AR';
        viewer.appendChild(start);
        viewer.addEventListener('load', () => {
          if (!cancelled)
            setMessage('Drag to rotate. Pinch or scroll to zoom.');
        });
        viewer.addEventListener('error', failure);
        viewer.addEventListener('ar-status', (event) => {
          if (cancelled) return;
          const status = (event as CustomEvent<{ status: string }>).detail
            .status;
          if (status === 'failed')
            setMessage(
              'AR could not start. Try Safari on iPhone or Chrome on an AR-compatible Android phone.',
            );
          else if (status === 'session-started')
            setMessage('Move your phone slowly toward a clear, well-lit wall.');
          else if (status === 'object-placed')
            setMessage('Walk around your artwork. Pinch to adjust its size.');
        });
        host.current.appendChild(viewer);
      })
      .catch(failure);
    return () => {
      cancelled = true;
      // Unregistering the scene stops the viewer's render loop when it is closed.
      viewer?.remove();
    };
  }, [work.id, work.handle, attempt]);
  return (
    <section className="ar-preview" aria-label="Artwork in your room">
      <div className="ar-model-host" ref={host} />
      <div className="ar-guide">
        <p role="status">{message}</p>
        {failed && (
          <button
            className="glass-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        )}
        <p className="ar-scale-note">
          100 cm along the image’s longest edge, plus its frame. Resize it in
          AR.
        </p>
        <p className="ar-device-note">
          On a compatible phone, tap Start AR to place it on a wall. Use Safari
          on iPhone/iPad or Chrome on Android; if AR is unavailable, you can
          still explore the 3D preview.
        </p>
      </div>
    </section>
  );
}
