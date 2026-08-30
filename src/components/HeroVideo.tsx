import { useState, useEffect } from 'react';

export default function HeroVideo() {
  const [isMobile, setIsMobile] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    setVideoReady(true);
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-slate-900">
      {videoReady ? (
        <video
          className="w-full h-[500px] sm:h-[600px] md:h-[700px] object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
        >
          <source src="/video_16faa126-dce6-406a-89f8-fbb330db42ce.mp4" type="video/mp4" />
        </video>
      ) : (
        <div className="w-full h-[500px] sm:h-[600px] md:h-[700px] bg-gradient-to-r from-teal-800 to-emerald-800 flex items-center justify-center">
          <span className="text-white text-xl">Chargement...</span>
        </div>
      )}
    </section>
  );
}
