import { MapSelectPage, TankDifficulty } from '../maps/MapSelectPage';
import { useTankSession } from '../../hooks/useTankSession';

type TankModeSelectProps = {
  onClose?: () => void;
};

export function TankModeSelect({ onClose }: TankModeSelectProps) {
  const selectedDifficulty: TankDifficulty = 'normal';
  const { setMode, setMap, setDifficulty } = useTankSession();

  const handleReturn = () => {
    // 优先使用回调；若未传入则直接清理 hash
    if (onClose) {
      onClose();
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    // 再次确保 hash 清理，避免残留，并主动触发 hashchange 让上层监听生效
    window.location.hash = '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  return (
    <MapSelectPage
      onBack={handleReturn}
      initialDifficulty={selectedDifficulty}
      onStart={(map, difficulty) => {
        // 暂无多模式玩法，默认固定为 skirmish。
        setMode('skirmish');
        setMap(map.key);
        setDifficulty(difficulty);
        window.location.hash = `tank-run?map=${map.key}&difficulty=${difficulty}`;
      }}
    />
  );
}
