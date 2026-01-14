'use client';

import { useState, useEffect } from 'react';
import CodeEditor from '../components/CodeEditor';
import Visualizer from '../components/Visualizer';

export default function Home() {
  const [visualizerData, setVisualizerData] = useState<string>('');

  // 初回読み込み時にoutput.txtを取得
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const response = await fetch('/api/execute-racket');
        if (response.ok) {
          const data = await response.json();
          if (data.output) {
            setVisualizerData(data.output);
          }
        }
      } catch (err) {
        console.error('初期データ読み込みエラー:', err);
      }
    };
    
    fetchInitialData();
  }, []);

  // CodeEditorから実行完了時に呼ばれるコールバック
  const handleExecute = (output: string) => {
    setVisualizerData(output);
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* ヘッダー */}
      <header className="w-full bg-white dark:bg-black border-b border-gray-300 dark:border-gray-700 p-4">
        <h2 className="text-2xl font-bold text-black dark:text-zinc-50 text-center">
          Continuation Visualizer
        </h2>
      </header>

      {/* メインコンテンツ */}
      <div className="flex flex-1 min-h-0">
        {/* 左半分: コードエディタ */}
        <div className="w-1/2 min-h-screen border-r border-gray-300 dark:border-gray-700 bg-white dark:bg-black">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-gray-300 dark:border-gray-700">
            <h2 className="text-xl font-bold text-black dark:text-zinc-50">
              Code Editor
            </h2>
          </div>
          <div className="flex-1 p-4">
            <CodeEditor 
              placeholder="コードを入力してください..." 
              onExecute={handleExecute}
            />
          </div>
        </div>
      </div>

      {/* 右半分: ビジュアライザー */}
      <div className="w-1/2 min-h-screen bg-white dark:bg-black">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-gray-300 dark:border-gray-700">
            <h2 className="text-xl font-bold text-black dark:text-zinc-50">
              Visualizer
            </h2>
          </div>
          <div className="flex-1 relative">
            <Visualizer data={visualizerData} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
