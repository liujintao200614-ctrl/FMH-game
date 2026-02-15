import { Play, Star, Coins } from 'lucide-react';
import { useState } from 'react';

export interface GameCardProps {
  title: string;
  category: string;
  description: string;
  reward: string;
  difficulty: string;
  rating: number;
  imageUrl: string;
  href: string;
  previewKey?: 'snake' | 'tank' | 'minesweeper' | 'merge2048' | 'tetris' | 'flybird' | 'nodeConquest';
  onPlay?: () => void;
}

export function GameCard({
  title,
  category,
  description,
  reward,
  difficulty,
  rating,
  imageUrl,
  href,
  previewKey,
  onPlay
}: GameCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <article
      className="lobby-card cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onPlay}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onPlay?.();
      }}
      role="button"
      tabIndex={0}
    >
      <div className={`relative h-48 ${previewKey ? 'card-preview-shell' : ''}`}>
        <img
          src={imageUrl}
          alt={title}
          className={`h-full w-full object-cover ${previewKey ? 'card-preview-image' : ''}`}
          loading="lazy"
        />
        {previewKey === 'snake' && (
          <div className="card-preview-snake" aria-hidden="true">
            <div className="card-preview-snake__bg" />
            <div className="card-preview-snake__grid" />
            <div className="card-preview-snake__orb card-preview-snake__orb--a" />
            <div className="card-preview-snake__orb card-preview-snake__orb--b" />
            <div className="card-preview-snake__orb card-preview-snake__orb--c" />
            <div className="card-preview-snake__food" />
            <div className="card-preview-snake__snake card-preview-snake__snake--green">
              <div className="snake-head">
                <i className="snake-eye snake-eye--left" />
                <i className="snake-eye snake-eye--right" />
              </div>
              <span className="snake-seg snake-seg--1" />
              <span className="snake-seg snake-seg--2" />
              <span className="snake-seg snake-seg--3" />
              <span className="snake-seg snake-seg--4" />
              <span className="snake-seg snake-seg--5" />
            </div>
            <div className="card-preview-snake__snake card-preview-snake__snake--blue">
              <div className="snake-head">
                <i className="snake-eye snake-eye--left" />
                <i className="snake-eye snake-eye--right" />
              </div>
              <span className="snake-seg snake-seg--1" />
              <span className="snake-seg snake-seg--2" />
              <span className="snake-seg snake-seg--3" />
              <span className="snake-seg snake-seg--4" />
            </div>
          </div>
        )}
        {previewKey === 'tank' && (
          <div className="card-preview-tank" aria-hidden="true">
            <div className="card-preview-tank__sea" />
            <div className="card-preview-tank__land" />
            <div className="card-preview-tank__road" />
            <div className="card-preview-tank__tank card-preview-tank__tank--a">
              <span className="tank-body" />
              <span className="tank-turret" />
              <span className="tank-barrel" />
            </div>
            <div className="card-preview-tank__tank card-preview-tank__tank--b">
              <span className="tank-body" />
              <span className="tank-turret" />
              <span className="tank-barrel" />
            </div>
            <div className="card-preview-tank__tank card-preview-tank__tank--c">
              <span className="tank-body" />
              <span className="tank-turret" />
              <span className="tank-barrel" />
            </div>
            <span className="card-preview-tank__tracer card-preview-tank__tracer--a" />
            <span className="card-preview-tank__tracer card-preview-tank__tracer--b" />
            <span className="card-preview-tank__tracer card-preview-tank__tracer--c" />
            <span className="card-preview-tank__scan" />
          </div>
        )}
        {previewKey === 'minesweeper' && (
          <div className="card-preview-minesweeper" aria-hidden="true">
            <div className="card-preview-minesweeper__frame">
              <div className="card-preview-minesweeper__board">
                {Array.from({ length: 81 }).map((_, idx) => (
                  <span key={idx} className="ms-cell" />
                ))}
              </div>
            </div>
          </div>
        )}
        {previewKey === 'merge2048' && (
          <div className="card-preview-2048" aria-hidden="true">
            <div className="card-preview-2048__bg" />
            <div className="card-preview-2048__dots" />
            <div className="card-preview-2048__board">
              <span className="tile tile-16">16</span>
              <span className="tile tile-128">128</span>
              <span className="tile tile-16-b">16</span>
              <span className="tile tile-4">4</span>
              <span className="tile tile-2">2</span>
              <span className="tile tile-16-c">16</span>
              <span className="tile tile-32">32</span>
              <span className="tile tile-8">8</span>
              <span className="tile tile-4-b">4</span>
              <span className="tile tile-2-b">2</span>
              <span className="tile tile-2-c merge-a">2</span>
              <span className="tile tile-2-d merge-b">2</span>
              <span className="tile tile-4-c merge-out">4</span>
            </div>
          </div>
        )}
        {previewKey === 'tetris' && (
          <div className="card-preview-tetris" aria-hidden="true">
            <div className="card-preview-tetris__bg" />
            <div className="card-preview-tetris__dots" />
            <div className="card-preview-tetris__layout">
              <div className="card-preview-tetris__board">
                {Array.from({ length: 140 }).map((_, idx) => (
                  <span key={idx} className="tetris-cell" />
                ))}
                <div className="tetris-stack tetris-stack--left" />
                <div className="tetris-stack tetris-stack--mid" />
                <div className="tetris-stack tetris-stack--right" />
                <div className="tetris-active" />
                <div className="tetris-ghost" />
              </div>
              <div className="tetris-side">
                <div className="tetris-panel">
                  <div className="tetris-panel__label">HOLD</div>
                  <div className="tetris-panel__piece">Z</div>
                </div>
                <div className="tetris-panel">
                  <div className="tetris-panel__label">NEXT</div>
                  <div className="tetris-panel__grid">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {previewKey === 'flybird' && (
          <div className="card-preview-flybird" aria-hidden="true">
            <div className="card-preview-flybird__bg" />
            <div className="card-preview-flybird__stars" />
            <div className="card-preview-flybird__clouds">
              <span className="cloud cloud--a" />
              <span className="cloud cloud--b" />
              <span className="cloud cloud--c" />
            </div>
            <div className="card-preview-flybird__pipes">
              <span className="pipe pipe--top" />
              <span className="pipe pipe--bottom" />
              <span className="pipe pipe--top pipe--far" />
              <span className="pipe pipe--bottom pipe--far" />
            </div>
            <div className="card-preview-flybird__bird">
              <span className="bird-body" />
              <span className="bird-eye" />
              <span className="bird-beak" />
            </div>
          </div>
        )}
        {previewKey === 'nodeConquest' && (
          <div className="card-preview-nodeconquest" aria-hidden="true">
            <div className="card-preview-nodeconquest__bg" />
            <div className="card-preview-nodeconquest__grain" />
            <svg className="card-preview-nodeconquest__map" viewBox="0 0 320 180" preserveAspectRatio="none">
              <path d="M15 146 L54 110 L96 123 L130 95 L186 108 L226 86 L278 88 L300 112 L270 160 L192 172 L110 166 L58 172 Z" className="nc-state nc-state--blue" />
              <path d="M102 82 L136 62 L176 64 L196 86 L186 108 L130 95 Z" className="nc-state nc-state--neutral-a" />
              <path d="M184 58 L228 54 L266 76 L226 86 L196 86 Z" className="nc-state nc-state--neutral-b" />
              <path d="M228 54 L286 48 L306 78 L278 88 L266 76 Z" className="nc-state nc-state--red" />
              <path d="M15 146 L54 110 L96 123 L130 95 L102 82 L60 88 L28 114 Z" className="nc-state nc-state--blue-deep" />
            </svg>
            <div className="nc-node nc-node--blue-main" />
            <div className="nc-node nc-node--blue-side" />
            <div className="nc-node nc-node--neutral-a" />
            <div className="nc-node nc-node--neutral-b" />
            <div className="nc-node nc-node--red-main" />
            <div className="nc-arrow">
              <span className="nc-arrow__shaft" />
              <span className="nc-arrow__head" />
            </div>
            <div className="nc-dots">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <span className="lobby-card-chip absolute top-3 left-3 px-3 py-1 rounded-full">
          {category}
        </span>
        {hovered && previewKey !== 'minesweeper' && previewKey !== 'tank' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              <Play className="text-black" size={24} />
            </div>
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-lg lobby-card-title">{title}</h4>
          <span className="text-[10px] uppercase tracking-[0.2em] lobby-card-meta">{difficulty}</span>
        </div>
        <p className="text-sm lobby-card-desc flex-1 min-h-[48px]">{description}</p>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 lobby-card-meta">
            {[...Array(5)].map((_, idx) => (
              <Star
                key={idx}
                size={16}
                fill={idx < Math.floor(rating) ? '#7a4bff' : 'transparent'}
                stroke="#7a4bff"
              />
            ))}
            <span className="ml-1">{rating.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 lobby-card-meta">
            <Coins size={16} />
            {reward}
          </div>
        </div>
        <button
          onClick={onPlay}
          className="lobby-button mt-2 text-center py-3 font-medium transition"
        >
          开始游戏
        </button>
      </div>
    </article>
  );
}
