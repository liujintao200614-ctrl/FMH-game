import { ReactNode, useEffect, useMemo, useState } from 'react';

type MobileLandscapeGuardProps = {
  children: ReactNode;
};

function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const detect = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
      const touchPoints = (window.navigator.maxTouchPoints ?? 0) > 0;
      setIsTouchDevice(coarse || uaMobile || touchPoints);
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  return isTouchDevice;
}

function useIsPortrait() {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const detect = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    detect();
    window.addEventListener('resize', detect);
    window.addEventListener('orientationchange', detect);
    return () => {
      window.removeEventListener('resize', detect);
      window.removeEventListener('orientationchange', detect);
    };
  }, []);

  return isPortrait;
}

export function MobileLandscapeGuard({ children }: MobileLandscapeGuardProps) {
  const isTouchDevice = useIsTouchDevice();
  const isPortrait = useIsPortrait();
  const shouldShowOverlay = useMemo(() => isTouchDevice && isPortrait, [isTouchDevice, isPortrait]);

  return (
    <div className="relative min-h-screen">
      {children}
      {shouldShowOverlay && (
        <div className="fixed inset-0 z-[120] bg-[#060b14]/96 text-white">
          <div className="flex h-full items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-2xl border border-[#2d4f73] bg-[#0b1524] p-6 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-[#4c7bb1] bg-[#10223a] text-2xl">
                ↻
              </div>
              <div className="text-lg font-semibold text-[#dcecff]">请横屏体验</div>
              <p className="mt-2 text-sm text-[#9fc1e6]">
                当前游戏在手机上为横屏优化，旋转设备后会自动继续。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
