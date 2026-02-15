import Phaser from 'phaser';
import { TankScene } from './TankScene';
import { TankSceneConfig } from './types';

export const defaultTankConfig: TankSceneConfig = {
  tileSize: 16,
  cols: 127,
  rows: 72,
  viewPercent: 0.55,
  miniMapWidth: 180,
  miniMapHeight: 110,
  miniMapPercent: 0.18,
  aiDifficulty: 'normal',
  palette: {
    ground: 0x1a2230,
    groundAlt: 0x202a3b,
    water: 0x1b3a5a,
    rock: 0x2b2f38,
    grid: 0x2b3a4f,
    base: 0x3a4d66,
    accent: 0xffb347
  }
};

export const createPhaserConfig = (parent: HTMLElement, scene: TankScene): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0b0f18',
  input: {
    keyboard: {
      target: window
    }
  },
  scene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: {
      width: 320,
      height: 200
    },
    max: {
      width: 4096,
      height: 4096
    }
  },
  render: {
    antialias: true,
    pixelArt: false
  }
});
