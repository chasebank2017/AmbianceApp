/**
 * MainScreen.tsx
 * 《静界》主界面组件
 * 
 * 功能：
 * - 多音轨音量控制器
 * - 立体声空间位置调节
 * - 播放控制
 * - 定时器设置
 * - 场景保存/加载
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import LinearGradient from 'react-native-linear-gradient';
import { audioEngine } from '../audio/NativeAudioBridge';
import { AudioTrack, TimerConfig } from '../audio/AmbianceAudioEngine';

const { width: screenWidth } = Dimensions.get('window');

// 预设音效列表
const PRESET_SOUNDS = [
  { id: 'rain', name: '雨声', file: 'rain.ogg', category: 'nature' },
  { id: 'ocean', name: '海浪', file: 'ocean.ogg', category: 'nature' },
  { id: 'forest', name: '森林', file: 'forest.ogg', category: 'nature' },
  { id: 'fireplace', name: '壁炉', file: 'fireplace.ogg', category: 'ambient' },
  { id: 'cafe', name: '咖啡馆', file: 'cafe.ogg', category: 'ambient' },
  { id: 'white_noise', name: '白噪音', file: 'white_noise.ogg', category: 'noise' },
  { id: 'brown_noise', name: '棕噪音', file: 'brown_noise.ogg', category: 'noise' },
  { id: 'pink_noise', name: '粉噪音', file: 'pink_noise.ogg', category: 'noise' },
];

interface TrackState {
  id: string;
  name: string;
  volume: number;
  pan: number;
  isActive: boolean;
}

const MainScreen: React.FC = () => {
  // 状态管理
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [timerDuration, setTimerDuration] = useState(30); // 分钟
  const [timerActive, setTimerActive] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  
  // 动画值
  const [pulseAnim] = useState(new Animated.Value(1));
  const [fadeAnim] = useState(new Animated.Value(0));

  // 初始化音频引擎
  useEffect(() => {
    initializeAudioEngine();
    
    // 设置事件监听器
    audioEngine.addEventListener('initialized', onEngineInitialized);
    audioEngine.addEventListener('playbackStarted', onPlaybackStarted);
    audioEngine.addEventListener('playbackPaused', onPlaybackPaused);
    audioEngine.addEventListener('playbackStopped', onPlaybackStopped);
    audioEngine.addEventListener('timerExpired', onTimerExpired);
    audioEngine.addEventListener('error', onEngineError);
    
    return () => {
      // 清理事件监听器
      audioEngine.removeEventListener('initialized', onEngineInitialized);
      audioEngine.removeEventListener('playbackStarted', onPlaybackStarted);
      audioEngine.removeEventListener('playbackPaused', onPlaybackPaused);
      audioEngine.removeEventListener('playbackStopped', onPlaybackStopped);
      audioEngine.removeEventListener('timerExpired', onTimerExpired);
      audioEngine.removeEventListener('error', onEngineError);
    };
  }, []);

  // 初始化音频引擎
  const initializeAudioEngine = async () => {
    try {
      const success = await audioEngine.initialize();
      if (success) {
        console.log('音频引擎初始化成功');
        // 启动淡入动画
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }).start();
      }
    } catch (error) {
      console.error('音频引擎初始化失败:', error);
      Alert.alert('初始化失败', '无法启动音频引擎，请重试');
    }
  };

  // 事件处理器
  const onEngineInitialized = useCallback(() => {
    setIsInitialized(true);
    loadPresetSounds();
  }, []);

  const onPlaybackStarted = useCallback(() => {
    setIsPlaying(true);
    startPulseAnimation();
  }, []);

  const onPlaybackPaused = useCallback(() => {
    setIsPlaying(false);
    stopPulseAnimation();
  }, []);

  const onPlaybackStopped = useCallback(() => {
    setIsPlaying(false);
    setTimerActive(false);
    stopPulseAnimation();
  }, []);

  const onTimerExpired = useCallback(() => {
    setTimerActive(false);
    setRemainingTime(0);
    Alert.alert('定时结束', '播放已自动停止');
  }, []);

  const onEngineError = useCallback((error: any) => {
    console.error('音频引擎错误:', error);
    Alert.alert('音频错误', error.message || '发生未知错误');
  }, []);

  // 加载预设音效
  const loadPresetSounds = async () => {
    const trackStates: TrackState[] = [];
    
    for (const sound of PRESET_SOUNDS) {
      try {
        const success = await audioEngine.addTrack(sound.id, sound.file);
        if (success) {
          trackStates.push({
            id: sound.id,
            name: sound.name,
            volume: 0,
            pan: 0,
            isActive: false,
          });
        }
      } catch (error) {
        console.error(`加载音效失败: ${sound.name}`, error);
      }
    }
    
    setTracks(trackStates);
  };

  // 播放控制
  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await audioEngine.pause();
      } else {
        // 检查是否有激活的音轨
        const activeTracks = tracks.filter(track => track.volume > 0);
        if (activeTracks.length === 0) {
          Alert.alert('提示', '请先调节音量以激活音效');
          return;
        }
        
        await audioEngine.play();
      }
    } catch (error) {
      console.error('播放控制失败:', error);
      Alert.alert('播放错误', '无法控制播放状态');
    }
  };

  const stopPlayback = async () => {
    try {
      await audioEngine.stop();
      await audioEngine.cancelTimer();
    } catch (error) {
      console.error('停止播放失败:', error);
    }
  };

  // 音轨控制
  const updateTrackVolume = async (trackId: string, volume: number) => {
    try {
      await audioEngine.setVolume(trackId, volume);
      
      setTracks(prevTracks =>
        prevTracks.map(track =>
          track.id === trackId
            ? { ...track, volume, isActive: volume > 0 }
            : track
        )
      );
    } catch (error) {
      console.error(`设置音量失败: ${trackId}`, error);
    }
  };

  const updateTrackPanning = async (trackId: string, pan: number) => {
    try {
      await audioEngine.setPanning(trackId, pan);
      
      setTracks(prevTracks =>
        prevTracks.map(track =>
          track.id === trackId ? { ...track, pan } : track
        )
      );
    } catch (error) {
      console.error(`设置立体声平衡失败: ${trackId}`, error);
    }
  };

  // 定时器控制
  const startTimer = async () => {
    try {
      const timerConfig: TimerConfig = {
        duration: timerDuration,
        fadeOut: true,
        fadeOutDuration: 2, // 2分钟淡出
      };
      
      const success = await audioEngine.setTimer(timerConfig);
      if (success) {
        setTimerActive(true);
        setRemainingTime(timerDuration);
        
        // 开始播放（如果还没有播放）
        if (!isPlaying) {
          await togglePlayback();
        }
      }
    } catch (error) {
      console.error('设置定时器失败:', error);
      Alert.alert('定时器错误', '无法设置定时器');
    }
  };

  const cancelTimer = async () => {
    try {
      await audioEngine.cancelTimer();
      setTimerActive(false);
      setRemainingTime(0);
    } catch (error) {
      console.error('取消定时器失败:', error);
    }
  };

  // 场景管理
  const saveCurrentScene = async () => {
    try {
      const activeTracks = tracks.filter(track => track.volume > 0);
      if (activeTracks.length === 0) {
        Alert.alert('提示', '当前没有激活的音效，无法保存场景');
        return;
      }
      
      const sceneName = `场景_${new Date().toLocaleTimeString()}`;
      const sceneId = await audioEngine.saveScene(sceneName);
      
      Alert.alert('保存成功', `场景已保存: ${sceneName}`);
    } catch (error) {
      console.error('保存场景失败:', error);
      Alert.alert('保存失败', '无法保存当前场景');
    }
  };

  // 动画控制
  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // 渲染音轨控制器
  const renderTrackController = (track: TrackState) => (
    <View key={track.id} style={styles.trackController}>
      <View style={styles.trackHeader}>
        <Text style={[styles.trackName, track.isActive && styles.trackNameActive]}>
          {track.name}
        </Text>
        <Text style={styles.volumeValue}>
          {Math.round(track.volume * 100)}%
        </Text>
      </View>
      
      {/* 音量控制 */}
      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>音量</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={track.volume}
          onValueChange={(value) => updateTrackVolume(track.id, value)}
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#E0E0E0"
          thumbStyle={styles.sliderThumb}
        />
      </View>
      
      {/* 立体声平衡控制 */}
      {track.isActive && (
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>
            立体声: {track.pan < 0 ? '左' : track.pan > 0 ? '右' : '居中'}
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={-1}
            maximumValue={1}
            value={track.pan}
            onValueChange={(value) => updateTrackPanning(track.id, value)}
            minimumTrackTintColor="#2196F3"
            maximumTrackTintColor="#FF9800"
            thumbStyle={styles.sliderThumb}
          />
        </View>
      )}
    </View>
  );

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>正在初始化音频引擎...</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#1a1a2e', '#16213e', '#0f3460']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* 标题 */}
        <View style={styles.header}>
          <Text style={styles.title}>《静界》</Text>
          <Text style={styles.subtitle}>创造你的专属氛围</Text>
        </View>

        {/* 主控制区域 */}
        <View style={styles.mainControls}>
          {/* 播放控制 */}
          <View style={styles.playbackControls}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.playButton, isPlaying && styles.playButtonActive]}
                onPress={togglePlayback}
              >
                <Text style={styles.playButtonText}>
                  {isPlaying ? '⏸️' : '▶️'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
            
            <TouchableOpacity style={styles.stopButton} onPress={stopPlayback}>
              <Text style={styles.stopButtonText}>⏹️</Text>
            </TouchableOpacity>
          </View>

          {/* 定时器控制 */}
          <View style={styles.timerControls}>
            <Text style={styles.timerLabel}>睡眠定时器</Text>
            <View style={styles.timerInputContainer}>
              <Slider
                style={styles.timerSlider}
                minimumValue={5}
                maximumValue={120}
                step={5}
                value={timerDuration}
                onValueChange={setTimerDuration}
                minimumTrackTintColor="#9C27B0"
                maximumTrackTintColor="#E0E0E0"
                disabled={timerActive}
              />
              <Text style={styles.timerValue}>{timerDuration}分钟</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.timerButton, timerActive && styles.timerButtonActive]}
              onPress={timerActive ? cancelTimer : startTimer}
            >
              <Text style={styles.timerButtonText}>
                {timerActive ? '取消定时器' : '设置定时器'}
              </Text>
            </TouchableOpacity>
            
            {timerActive && (
              <Text style={styles.remainingTime}>
                剩余时间: {Math.ceil(remainingTime)}分钟
              </Text>
            )}
          </View>
        </View>

        {/* 音轨控制器列表 */}
        <ScrollView style={styles.tracksList} showsVerticalScrollIndicator={false}>
          <Text style={styles.tracksTitle}>音效混音台</Text>
          {tracks.map(renderTrackController)}
          
          {/* 场景控制 */}
          <View style={styles.sceneControls}>
            <TouchableOpacity style={styles.saveSceneButton} onPress={saveCurrentScene}>
              <Text style={styles.saveSceneButtonText}>保存当前场景</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '300',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#b0b0b0',
    fontWeight: '300',
  },
  mainControls: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  playbackControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  playButtonActive: {
    backgroundColor: '#FF9800',
  },
  playButtonText: {
    fontSize: 24,
  },
  stopButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  stopButtonText: {
    fontSize: 20,
  },
  timerControls: {
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 10,
    fontWeight: '500',
  },
  timerInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
  },
  timerSlider: {
    flex: 1,
    height: 40,
  },
  timerValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'center',
  },
  timerButton: {
    backgroundColor: '#9C27B0',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 3,
  },
  timerButtonActive: {
    backgroundColor: '#E91E63',
  },
  timerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  remainingTime: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  tracksList: {
    flex: 1,
  },
  tracksTitle: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },
  trackController: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  trackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  trackName: {
    fontSize: 16,
    color: '#b0b0b0',
    fontWeight: '500',
  },
  trackNameActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  volumeValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  sliderContainer: {
    marginBottom: 10,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#b0b0b0',
    marginBottom: 5,
  },
  slider: {
    width: '100%',
    height: 30,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    backgroundColor: '#ffffff',
  },
  sceneControls: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  saveSceneButton: {
    backgroundColor: '#3F51B5',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 3,
  },
  saveSceneButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MainScreen; 