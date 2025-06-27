/**
 * App.tsx
 * 《静界》应用主入口
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MainScreen from './src/components/MainScreen';

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
};

export default App;
