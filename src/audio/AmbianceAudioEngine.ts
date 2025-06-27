/**
 * 《静界》核心音频引擎接口定义
 * 这是React Native层与原生音频模块的桥接接口
 */

export interface AudioTrack {
  id: string;
  name: string;
  category: 'nature' | 'ambient' | 'noise' | 'meditation';
  file: string;
  duration: number;
  isLoaded: boolean;
  isPlaying: boolean;
  volume: number;      // 0.0 - 1.0
  pan: number;         // -1.0 (左) 到 1.0 (右)
}

export interface AudioScene {
  id: string;
  name: string;
  description?: string;
  tracks: AudioTrack[];
  createdAt: Date;
  updatedAt: Date;
  creatorId?: string;
  isShared?: boolean;
  shareCount?: number;
}

export interface TimerConfig {
  duration: number;     // 分钟
  fadeOut: boolean;
  fadeOutDuration: number; // 淡出时长（分钟）
}

/**
 * 核心音频引擎接口
 * 所有方法都返回Promise以支持异步操作
 */
export interface AmbianceAudioEngine {
  
  // ==================== 初始化与生命周期 ====================
  
  /**
   * 初始化音频引擎
   * @returns Promise<boolean> 初始化是否成功
   */
  initialize(): Promise<boolean>;
  
  /**
   * 销毁音频引擎，释放资源
   */
  destroy(): Promise<void>;
  
  /**
   * 获取引擎状态
   */
  getStatus(): Promise<{
    isInitialized: boolean;
    isPlaying: boolean;
    activeTracks: number;
    memoryUsage: number;
  }>;

  // ==================== 音轨管理 ====================
  
  /**
   * 添加音轨到混音器
   * @param trackId 唯一标识符
   * @param audioFile 音频文件路径
   * @returns Promise<boolean> 是否添加成功
   */
  addTrack(trackId: string, audioFile: string): Promise<boolean>;
  
  /**
   * 移除音轨
   * @param trackId 音轨ID
   */
  removeTrack(trackId: string): Promise<boolean>;
  
  /**
   * 获取所有已加载的音轨
   */
  getTracks(): Promise<AudioTrack[]>;
  
  /**
   * 获取特定音轨信息
   */
  getTrack(trackId: string): Promise<AudioTrack | null>;

  // ==================== 音频控制 ====================
  
  /**
   * 设置音轨音量
   * @param trackId 音轨ID
   * @param volume 音量 (0.0 - 1.0)
   */
  setVolume(trackId: string, volume: number): Promise<boolean>;
  
  /**
   * 设置音轨立体声平衡
   * @param trackId 音轨ID  
   * @param pan 平衡值 (-1.0 左 到 1.0 右)
   */
  setPanning(trackId: string, pan: number): Promise<boolean>;
  
  /**
   * 设置主音量
   * @param volume 主音量 (0.0 - 1.0)
   */
  setMasterVolume(volume: number): Promise<boolean>;

  // ==================== 播放控制 ====================
  
  /**
   * 开始播放所有已配置的音轨
   */
  play(): Promise<boolean>;
  
  /**
   * 暂停播放
   */
  pause(): Promise<boolean>;
  
  /**
   * 停止播放并重置到开始位置
   */
  stop(): Promise<boolean>;
  
  /**
   * 播放特定音轨
   */
  playTrack(trackId: string): Promise<boolean>;
  
  /**
   * 暂停特定音轨
   */
  pauseTrack(trackId: string): Promise<boolean>;

  // ==================== 定时器功能 ====================
  
  /**
   * 设置播放定时器
   * @param config 定时器配置
   */
  setTimer(config: TimerConfig): Promise<boolean>;
  
  /**
   * 取消定时器
   */
  cancelTimer(): Promise<boolean>;
  
  /**
   * 获取剩余时间（分钟）
   */
  getRemainingTime(): Promise<number>;

  // ==================== 场景管理 ====================
  
  /**
   * 保存当前场景
   * @param sceneName 场景名称
   * @returns Promise<string> 场景ID
   */
  saveScene(sceneName: string): Promise<string>;
  
  /**
   * 加载场景
   * @param sceneId 场景ID或场景配置
   */
  loadScene(sceneId: string | AudioScene): Promise<boolean>;
  
  /**
   * 获取当前场景配置
   */
  getCurrentScene(): Promise<AudioScene | null>;

  // ==================== 事件监听 ====================
  
  /**
   * 添加事件监听器
   */
  addEventListener(event: AudioEngineEvent, listener: EventListener): void;
  
  /**
   * 移除事件监听器
   */
  removeEventListener(event: AudioEngineEvent, listener: EventListener): void;
}

// ==================== 事件定义 ====================

export type AudioEngineEvent = 
  | 'initialized'           // 引擎初始化完成
  | 'trackAdded'           // 音轨添加
  | 'trackRemoved'         // 音轨移除
  | 'playbackStarted'      // 开始播放
  | 'playbackPaused'       // 暂停播放
  | 'playbackStopped'      // 停止播放
  | 'volumeChanged'        // 音量变化
  | 'panningChanged'       // 立体声平衡变化
  | 'timerExpired'         // 定时器结束
  | 'sceneLoaded'          // 场景加载完成
  | 'error';               // 错误发生

export interface EventListener {
  (data?: any): void;
}

// ==================== 错误类型定义 ====================

export enum AudioEngineError {
  ENGINE_NOT_INITIALIZED = 'ENGINE_NOT_INITIALIZED',
  TRACK_NOT_FOUND = 'TRACK_NOT_FOUND',
  AUDIO_FILE_NOT_FOUND = 'AUDIO_FILE_NOT_FOUND',
  PLAYBACK_FAILED = 'PLAYBACK_FAILED',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  MEMORY_INSUFFICIENT = 'MEMORY_INSUFFICIENT'
}

// ==================== 工具函数 ====================

export class AudioEngineUtils {
  /**
   * 验证音量值是否有效
   */
  static isValidVolume(volume: number): boolean {
    return volume >= 0.0 && volume <= 1.0;
  }
  
  /**
   * 验证立体声平衡值是否有效
   */
  static isValidPan(pan: number): boolean {
    return pan >= -1.0 && pan <= 1.0;
  }
  
  /**
   * 生成音轨ID
   */
  static generateTrackId(): string {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 生成场景ID
   */
  static generateSceneId(): string {
    return `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 音频引擎配置
 */
export interface AudioEngineConfig {
  sampleRate: number;           // 采样率 (默认: 44100)
  bufferSize: number;           // 缓冲区大小 (默认: 1024)
  maxTracks: number;            // 最大音轨数 (默认: 8)
  enableBackgroundPlayback: boolean; // 启用后台播放 (默认: true)
  audioFormat: 'mp3' | 'ogg' | 'wav'; // 音频格式偏好 (默认: 'ogg')
}

export const DEFAULT_AUDIO_CONFIG: AudioEngineConfig = {
  sampleRate: 44100,
  bufferSize: 1024,
  maxTracks: 8,
  enableBackgroundPlayback: true,
  audioFormat: 'ogg'
}; 