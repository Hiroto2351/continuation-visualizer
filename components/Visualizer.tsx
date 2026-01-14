'use client';

import { useState } from 'react';
import Stack from './Stack';
import './Visualizer.css';

interface VisualizerProps {
  data: string;
}

interface StackItem {
  id: number;
  value: string;
  isFromContinuation?: boolean;
}

interface StackFrame {
  id: number;
  name: string;
  items: StackItem[];
  displayValue?: string;
  isOutputFrame?: boolean;
  captureType?: 'capture' | 'shift';
}

interface StackTower {
  id: number;
  frames: StackFrame[];
  captureType?: 'capture' | 'shift';
  name?: string;
}

interface HistoryEntry {
  action: 'capture' | 'invoke' | 'set' | 'reset' | 'shift';
  timestamp: number;
  stackSnapshot: string;
}

interface ResetMarker {
  towerIndex: number;
  frameIndex: number;
  itemIndex: number;
}

function Visualizer({ data }: VisualizerProps) {
  const [stackTowers, setStackTowers] = useState<StackTower[]>([]);
  const [continuations, setContinuations] = useState<StackTower[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [message, setMessage] = useState('');
  const [nextId, setNextId] = useState(0);
  const [isInvoking, setIsInvoking] = useState(false);
  const [isClearingStack, setIsClearingStack] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<number | null>(null);
  const [removingTowerIndex, setRemovingTowerIndex] = useState<number | null>(null);
  const [removingFrameIndex, setRemovingFrameIndex] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturingTowerId, setCapturingTowerId] = useState<number | null>(null);
  const [removingItemIds, setRemovingItemIds] = useState<number[]>([]);
  const [pushingItemId, setPushingItemId] = useState<number | null>(null);
  const [pushingItemIds, setPushingItemIds] = useState<number[]>([]);
  const [pushingFrameIds, setPushingFrameIds] = useState<number[]>([]);
  const [highlightingFrameIds, setHighlightingFrameIds] = useState<number[]>([]);
  const [invokingContinuationId, setInvokingContinuationId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [output, setOutput] = useState<string[]>([]);
  const [resetMarker, setResetMarker] = useState<ResetMarker | null>(null);

  const lines = data.split('\n').filter(line => line.trim() !== '');

  const handleStep = () => {
    if (currentLine >= lines.length) {
      setMessage('実行完了');
      return;
    }

    const line = lines[currentLine];
    setMessage(line);

    // デバッグ用：読み込んだコマンドをログ出力
    console.log('Current line:', currentLine, 'Command:', line);

    // reset コマンドを処理
    const resetMatch = line.match(/^reset:\s*\((.+)\)/);
    if (resetMatch) {
      // カッコの中身を取得してresetを除いた部分を抽出
      const innerContent = resetMatch[1];
      // resetを除いた部分を取得（例: "reset + 1" -> "+ 1"）
      const continuationInfo = innerContent.replace(/\breset\b/g, '').trim();

      // 履歴に追加
      setHistory(prev => [...prev, {
        action: 'reset',
        timestamp: Date.now(),
        stackSnapshot: continuationInfo
      }]);

      // resetマーカーを設定（一番左のタワーの一番上のフレームの現在のアイテム位置）
      if (stackTowers.length > 0) {
        const leftTower = stackTowers[0];
        const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);
        if (realFrames.length > 0) {
          const topFrame = realFrames[realFrames.length - 1];
          setResetMarker({
            towerIndex: 0,
            frameIndex: realFrames.length - 1,
            itemIndex: topFrame.items.length
          });
        }
      }

      setCurrentLine(prev => prev + 1);
      return;
    }

    // shift コマンドを処理
    // 形式: shift: k (shift k + 10)
    const shiftMatch = line.match(/^shift:\s*(\w+)\s*\((.+)\)/);
    if (shiftMatch) {
      const continuationName = shiftMatch[1]; // k1, k2 など
      const shiftInfo = shiftMatch[2]; // shift k + 10 など
      
      if (!resetMarker || stackTowers.length === 0) {
        setCurrentLine(prev => prev + 1);
        return;
      }

      // 一番左のタワーを取得
      const leftTower = stackTowers[0];
      const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);

      // resetマーカーのフレームインデックスから一番上のフレームまで切り取る
      if (resetMarker.frameIndex >= realFrames.length) {
        setCurrentLine(prev => prev + 1);
        return;
      }

      // resetマーカーのフレームとそれより上のフレームを取得
      const markedFrame = realFrames[resetMarker.frameIndex];
      const framesAbove = realFrames.slice(resetMarker.frameIndex + 1);

      // resetマーカーのフレームからはresetMarker.itemIndex以降のアイテムのみを取得
      const capturedItemsFromMarkedFrame = markedFrame.items.slice(resetMarker.itemIndex);

      // 削除対象のアイテムIDを収集
      const itemIdsToRemove: number[] = [];
      capturedItemsFromMarkedFrame.forEach(item => {
        itemIdsToRemove.push(item.id);
      });
      framesAbove.forEach(frame => {
        frame.items.forEach(item => {
          itemIdsToRemove.push(item.id);
        });
      });
      setRemovingItemIds(itemIdsToRemove);

      setTimeout(() => {
        // アニメーション開始
        setIsCapturing(true);

        setTimeout(() => {
          // 継続として保存
          let idOffset = 0;
          const newCapturedFrames: StackFrame[] = [];

          // resetマーカーのフレームからアイテムを切り取る場合
          if (capturedItemsFromMarkedFrame.length > 0) {
            const newFrame: StackFrame = {
              id: nextId + idOffset,
              name: markedFrame.name, // 元のフレーム名を保持
              items: capturedItemsFromMarkedFrame.map((item, index) => ({
                ...item,
                id: nextId + idOffset + 1 + index
              })),
              captureType: 'shift'
            };
            idOffset += 1 + capturedItemsFromMarkedFrame.length;
            newCapturedFrames.push(newFrame);
          }

          // それより上のフレームを全て追加
          framesAbove.forEach(frame => {
            const newFrame: StackFrame = {
              id: nextId + idOffset,
              name: frame.name, // 元のフレーム名を保持
              items: frame.items.map((item, index) => ({
                ...item,
                id: nextId + idOffset + 1 + index
              })),
              captureType: 'shift'
            };
            idOffset += 1 + frame.items.length;
            newCapturedFrames.push(newFrame);
          });

          const capturedContinuation: StackTower = {
            id: nextId + idOffset,
            name: continuationName, // タワー名として継続名を設定
            frames: newCapturedFrames,
            captureType: 'shift'
          };

          setCapturingTowerId(capturedContinuation.id);
          setContinuations(prev => [...prev, capturedContinuation]);

          // 履歴に追加
          setHistory(prev => [...prev, {
            action: 'shift',
            timestamp: Date.now(),
            stackSnapshot: shiftInfo
          }]);

          // スタックから切り取ったアイテム・フレームを削除
          setStackTowers(prev => {
            const newTowers = [...prev];
            const leftTower = { ...newTowers[0] };

            // 出力フレームとリアルフレームを分ける
            const outputFrames = leftTower.frames.filter(f => f.isOutputFrame);

            // resetマーカーより下のフレームは保持
            const framesBelow = realFrames.slice(0, resetMarker.frameIndex);

            // resetマーカーのフレームはresetMarker.itemIndexまでのアイテムを保持
            const updatedMarkedFrame = {
              ...markedFrame,
              items: markedFrame.items.slice(0, resetMarker.itemIndex)
            };

            // 新しいリアルフレーム = 下のフレーム + 更新されたマーカーフレーム
            const newRealFrames = [...framesBelow, updatedMarkedFrame];

            // 統合
            leftTower.frames = [...newRealFrames, ...outputFrames];
            newTowers[0] = leftTower;
            return newTowers;
          });

          setNextId(prev => prev + idOffset + 1);
          setRemovingItemIds([]);
          
          // shift実行後の位置に新しいresetマーカーを設定
          setStackTowers(prev => {
            if (prev.length > 0) {
              const leftTower = prev[0];
              const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);
              if (realFrames.length > 0) {
                const topFrame = realFrames[realFrames.length - 1];
                setResetMarker({
                  towerIndex: 0,
                  frameIndex: realFrames.length - 1,
                  itemIndex: topFrame.items.length
                });
              }
            }
            return prev;
          });
        }, 100);
      }, 100);

      setCurrentLine(prev => prev + 1);
      return;
    }

    // set: 関数名 => 継続 を処理
    const setMatch = line.match(/^set:\s*([^\s]+)\s*=>\s*(.+)/);
    if (setMatch) {
      const functionName = setMatch[1];
      const continuationInfo = setMatch[2];

      // 継続の履歴に追加
      setHistory(prev => [...prev, {
        action: 'set',
        timestamp: Date.now(),
        stackSnapshot: `${functionName} => ${continuationInfo}`
      }]);

      const continuation = continuations.length > 0 ? continuations[continuations.length - 1] : null;

      if (!continuation) {
        setCurrentLine(prev => prev + 1);
        return;
      }

      // 新しい関数フレームを作成
      const newFunctionFrame: StackFrame = {
        id: nextId,
        name: `(${functionName})`,
        items: []
      };

      // 継続タワーの全フレームをコピーして、isFromContinuationフラグを付ける
      const continuationFrames = continuation.frames.map((frame, index) => ({
        ...frame,
        id: nextId + 1 + index,
        items: frame.items.map(item => ({
          ...item,
          isFromContinuation: true
        }))
      }));

      // 新しいタワーを作成（継続のフレームを下に、関数フレームを上に重ねる）
      const newTower: StackTower = {
        id: nextId + 1 + continuation.frames.length,
        frames: [...continuationFrames, newFunctionFrame]
      };

      // 全フレームにpushingアニメーションを適用
      const allFrameIds = [newFunctionFrame.id, ...continuationFrames.map(f => f.id)];
      setPushingFrameIds(allFrameIds);

      setStackTowers(prev => [...prev, newTower]);
      setNextId(prev => prev + 2 + continuation.frames.length);
      
      setTimeout(() => setPushingFrameIds([]), 400);
      setCurrentLine(prev => prev + 1);
      return;
    }

    // 関数呼び出しを処理（複数の>に対応）
    // 行の最初に>が来る場合のみ処理
    const callMatches = line.match(/^>/) ? line.match(/>\s*\(([^)]+)\)/g) : null;
    if (callMatches && callMatches.length > 0) {
      let idOffset = 0;
      const newFrames: StackFrame[] = [];
      let replacingTopFrame = false;
      let replacementValue = '';

      for (const match of callMatches) {
        const functionNameMatch = match.match(/>\s*\(([^)]+)\)/);
        if (functionNameMatch) {
          const fullCall = functionNameMatch[1];

          // 継続の呼び出しかチェック
          const continuationCallMatch = fullCall.match(/^(\w+)\s+(.+)$/);
          if (continuationCallMatch) {
            const funcName = continuationCallMatch[1];
            const argument = continuationCallMatch[2];

            // 履歴から継続かどうかを確認
            const isContinuation = history.some(h => h.action === 'set' && h.stackSnapshot.startsWith(funcName));

            if (isContinuation) {
              // 一番上のフレームが呼び出された継続かチェック
              if (stackTowers.length > 0) {
                const lastTower = stackTowers[stackTowers.length - 1];
                if (lastTower.frames.length > 0) {
                  const topFrame = lastTower.frames[lastTower.frames.length - 1];
                  // フレーム名が (funcName) にマッチするかチェック
                  if (topFrame.name === `(${funcName})`) {
                    // 一番上のフレームを削除して値フレームに置き換える
                    replacingTopFrame = true;
                    replacementValue = argument;
                  } else {
                    // 継続の場合は引数の値をフレーム名にする
                    newFrames.push({ id: nextId + idOffset, name: argument, items: [] });
                    idOffset++;
                  }
                } else {
                  newFrames.push({ id: nextId + idOffset, name: argument, items: [] });
                  idOffset++;
                }
              } else {
                newFrames.push({ id: nextId + idOffset, name: argument, items: [] });
                idOffset++;
              }
            } else {
              // 通常の関数呼び出し
              newFrames.push({ id: nextId + idOffset, name: `(${fullCall})`, items: [] });
              idOffset++;
            }
          } else {
            // 引数なしの呼び出し
            newFrames.push({ id: nextId + idOffset, name: `(${fullCall})`, items: [] });
            idOffset++;
          }
        }
      }

      // 最後のタワーにフレームを追加、または一番上のフレームを置き換え
      setStackTowers(prev => {
        if (replacingTopFrame && prev.length > 0) {
          // 一番上のフレームを削除して値フレームに置き換える
          const newTowers = [...prev];
          const lastTower = { ...newTowers[newTowers.length - 1] };
          const updatedFrames = lastTower.frames.slice(0, -1); // 一番上のフレームを削除

          // 値フレームを追加
          const valueFrame: StackFrame = {
            id: nextId,
            name: '',
            items: [],
            displayValue: replacementValue,
            isOutputFrame: true
          };

          lastTower.frames = [...updatedFrames, valueFrame];
          newTowers[newTowers.length - 1] = lastTower;
          setNextId(prev => prev + 1);
          return newTowers;
        }

        if (prev.length === 0) {
          // 新しいタワーとフレームを作成する場合、アニメーションを適用
          const frameIds = newFrames.map(f => f.id);
          setPushingFrameIds(frameIds);
          setTimeout(() => setPushingFrameIds([]), 400);
          
          return [{
            id: nextId + idOffset,
            frames: newFrames
          }];
        }
        const newTowers = [...prev];
        const lastTower = { ...newTowers[newTowers.length - 1] };
        
        // 既存のフレーム名をチェックして、重複しないフレームのみを追加
        const existingFrameNames = new Set(lastTower.frames.map(f => f.name));
        const framesToAdd = newFrames.filter(f => !existingFrameNames.has(f.name));
        const duplicateFrames = newFrames.filter(f => existingFrameNames.has(f.name));
        
        if (framesToAdd.length > 0) {
          // 新しいフレームにアニメーションを適用
          const frameIds = framesToAdd.map(f => f.id);
          setPushingFrameIds(frameIds);
          setTimeout(() => setPushingFrameIds([]), 400);
          
          lastTower.frames = [...lastTower.frames, ...framesToAdd];
        }
        
        // 重複したフレームがある場合、既存のフレームを強調表示
        if (duplicateFrames.length > 0) {
          const duplicateFrameNames = new Set(duplicateFrames.map(f => f.name));
          const existingFrameIds = lastTower.frames
            .filter(f => duplicateFrameNames.has(f.name))
            .map(f => f.id);
          
          setHighlightingFrameIds(existingFrameIds);
          setTimeout(() => setHighlightingFrameIds([]), 400);
        }
        
        newTowers[newTowers.length - 1] = lastTower;
        return newTowers;
      });
      if (!replacingTopFrame) {
        setNextId(prev => prev + idOffset);
      }

      setCurrentLine(prev => prev + 1);
      return;
    }

    // push命令を処理
    // push (value) の形式で、カッコの中身全体を取得（ネストしたカッコにも対応）
    const pushMatch = line.match(/^push\s+\((.+)\)$/);
    if (pushMatch) {
      let value = pushMatch[1];
      
      // カッコのネストを考慮して正しい終了位置を見つける
      let depth = 0;
      let endPos = -1;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        else if (value[i] === ')') {
          depth--;
          if (depth < 0) {
            endPos = i;
            break;
          }
        }
      }
      
      // 余分な閉じカッコがあれば除去
      if (endPos >= 0) {
        value = value.substring(0, endPos);
      }

      // 一番左のタワーが存在し、フレームがある場合のみ処理
      if (stackTowers.length > 0 && stackTowers[0].frames.length > 0) {
        // 出力フレームを除外して実際のフレームを取得
        const leftTower = stackTowers[0];
        const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);

        if (realFrames.length > 0) {
          setPushingItemId(nextId);
          // 一番左のタワーの一番上のフレームにアイテムを追加
          setStackTowers(prev => {
            const newTowers = [...prev];
            const leftTower = { ...newTowers[0] };
            const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);
            const topFrameIndex = realFrames.length - 1;
            const topFrame = realFrames[topFrameIndex];

            const updatedTopFrame = {
              ...topFrame,
              items: [...topFrame.items, { id: nextId, value: `(${value})` }]
            };

            // 実際のフレームを更新
            const updatedRealFrames = [
              ...realFrames.slice(0, topFrameIndex),
              updatedTopFrame
            ];

            // 出力フレームを保持
            const outputFrames = leftTower.frames.filter(f => f.isOutputFrame);

            const updatedTower = {
              ...leftTower,
              frames: [...updatedRealFrames, ...outputFrames]
            };

            // 一番左のタワーのみを置き換え
            newTowers[0] = updatedTower;
            return newTowers;
          });
          setTimeout(() => setPushingItemId(null), 400);
        }
      } else {
        // フレームがない場合、mainフレームとタワーを作成
        const frameId = nextId + 1;
        const itemId = nextId + 2;
        
        setPushingItemId(itemId);
        setPushingFrameIds([frameId]);
        
        setStackTowers([{
          id: nextId,
          frames: [{ id: frameId, name: '(main)', items: [{ id: itemId, value: `(${value})` }] }]
        }]);
        setNextId(prev => prev + 2);
        
        setTimeout(() => {
          setPushingItemId(null);
          setPushingFrameIds([]);
        }, 400);
      }
      setNextId(prev => prev + 1);
      setCurrentLine(prev => prev + 1);
      return;
    }

    // <演算子でスタックフレームの出力を処理（一番左のタワーの一番上のフレームのみ）
    const frameOutputMatch = line.match(/</);
    if (frameOutputMatch) {
      // 一番左のタワーが存在し、フレームがある場合のみ処理
      if (stackTowers.length > 0 && stackTowers[0].frames.length > 0) {
        // 出力フレームを除外して実際のフレームを取得
        const leftTower = stackTowers[0];
        const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);

        if (realFrames.length > 0) {
          const topFrame = realFrames[realFrames.length - 1];
          const outputValue = topFrame.displayValue || '';

          setTimeout(() => {
            setStackTowers(prev => {
              const newTowers = [...prev];
              const leftTower = { ...newTowers[0] };

              // 出力フレームを除外して実際のフレームを取得
              const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);
              // 一番上のフレームを削除
              const updatedRealFrames = realFrames.slice(0, -1);

              // 出力値がある場合、表示用フレームを追加
              if (outputValue) {
                const outputFrame: StackFrame = {
                  id: nextId,
                  name: '',
                  items: [],
                  displayValue: outputValue,
                  isOutputFrame: true
                };
                leftTower.frames = [...updatedRealFrames, outputFrame];
                setNextId(prev => prev + 1);
              } else {
                leftTower.frames = updatedRealFrames;
              }

              newTowers[0] = leftTower;
              return newTowers;
            });
          }, 0);
        }
      }
      setCurrentLine(prev => prev + 1);
      return;
    }

    // pop命令を処理（一番左のタワーの一番上のフレームのみ）
    const popMatch = line.match(/^pop\s+(.+?)\s*=>\s*(.+)/);
    if (popMatch) {
      const result = popMatch[2];
      // 一番左のタワーが存在し、フレームと要素がある場合のみ処理
      if (stackTowers.length > 0 && stackTowers[0].frames.length > 0) {
        // 出力フレームを除外して実際のフレームを取得
        const realFrames = stackTowers[0].frames.filter(f => !f.isOutputFrame);

        if (realFrames.length > 0) {
          const currentFrame = realFrames[realFrames.length - 1];
          if (currentFrame.items.length > 0) {
            const lastItem = currentFrame.items[currentFrame.items.length - 1];
            setRemovingItemId(lastItem.id);
            setRemovingTowerIndex(0);
            setRemovingFrameIndex(realFrames.length - 1);
            setTimeout(() => {
              // 一番左のタワーの一番上のフレームの要素のみをpop
              setStackTowers(prev => {
                const leftTower = prev[0];
                const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);
                const topFrameIndex = realFrames.length - 1;
                const topFrame = realFrames[topFrameIndex];

                const updatedTopFrame = {
                  ...topFrame,
                  items: topFrame.items.slice(0, -1),
                  displayValue: result
                };

                // 実際のフレームを更新
                const updatedRealFrames = [
                  ...realFrames.slice(0, topFrameIndex),
                  updatedTopFrame
                ];

                const updatedTower = {
                  ...leftTower,
                  frames: updatedRealFrames
                };

                // 一番左のタワーのみを置き換え、他のタワーは参照をそのまま保持
                const newTowers = [...prev];
                newTowers[0] = updatedTower;
                return newTowers;
              });
              setRemovingItemId(null);
              setRemovingTowerIndex(null);
              setRemovingFrameIndex(null);
              setCurrentLine(prev => prev + 1);
            }, 200);
            return;
          }
        }
      }
      // 一番左のタワーが存在しないか、popできない場合は次の行へ
      setCurrentLine(prev => prev + 1);
      return;
    }

    // 継続をキャプチャ
    // 形式: capture: k (call/cc + 1)
    const captureMatch = line.match(/capture:\s*(\w+)\s*\((.+)\)/);
    
    if (captureMatch) {
      const continuationName = captureMatch[1];
      const captureInfo = captureMatch[2];

      // 最後のタワーをそのままコピーしてキャプチャ
      if (stackTowers.length > 0) {
        const towerId = nextId;
        setIsCapturing(true);
        setCapturingTowerId(towerId);

        const lastTower = stackTowers[stackTowers.length - 1];
        const copiedTower: StackTower = {
          ...lastTower,
          id: nextId,
          name: continuationName, // タワー名として継続名を設定
          frames: lastTower.frames.map(frame => ({
            ...frame, // 元のフレーム名を保持
            id: nextId + 1 + lastTower.frames.indexOf(frame),
            items: [...frame.items]
          }))
        };
        setContinuations(prev => [...prev, copiedTower]);
        setNextId(prev => prev + 2 + lastTower.frames.length);

        // 履歴に「継続:k => (marks情報)」の形式で保存
        setHistory(prev => [...prev, {
          action: 'capture',
          timestamp: Date.now(),
          stackSnapshot: `継続:${continuationName} => ${captureInfo}`
        }]);
        
        // アニメーション後にcapturingクラスをクリア
        setTimeout(() => {
          setIsCapturing(false);
          setCapturingTowerId(null);
        }, 400);
      }
      setCurrentLine(prev => prev + 1);
      return;
    }

    // 継続を呼び出し
    // 形式: call: k (value:100,marks:(k 100))
    const callMatch = line.match(/call:\s*(\w+)\s*\(value:([^,]+),marks:(.+)\)$/);
    
    if (callMatch) {
      const continuationName = callMatch[1];
      let valueArg = callMatch[2];
      let marksInfo = callMatch[3];
      
      // marksInfoの末尾の余分な閉じカッコを除去
      let depth = 0;
      let endPos = marksInfo.length;
      for (let i = marksInfo.length - 1; i >= 0; i--) {
        if (marksInfo[i] === ')') {
          depth++;
        } else if (marksInfo[i] === '(') {
          depth--;
          if (depth === 0) {
            endPos = i + 1;
            break;
          }
        }
      }
      
      // 最初の開きカッコから対応する閉じカッコまでを取得
      if (marksInfo.startsWith('(')) {
        let marksDepth = 0;
        let marksEndPos = 0;
        for (let i = 0; i < marksInfo.length; i++) {
          if (marksInfo[i] === '(') marksDepth++;
          else if (marksInfo[i] === ')') {
            marksDepth--;
            if (marksDepth === 0) {
              marksEndPos = i + 1;
              break;
            }
          }
        }
        if (marksEndPos > 0) {
          marksInfo = marksInfo.substring(0, marksEndPos);
        }
      }
      
      // 継続名と一致するタワー名を持つ継続を探す
      const continuation = continuations.find(cont => cont.name === continuationName);
      
      if (!continuation) {
        setCurrentLine(prev => prev + 1);
        return;
      }
      
      // 履歴に追加
      setHistory(prev => [...prev, {
        action: 'invoke',
        timestamp: Date.now(),
        stackSnapshot: `引数:${valueArg} 継続:${continuationName} => ${marksInfo}`
      }]);

      // 継続にフェードアウトアニメーションを適用
      setInvokingContinuationId(continuation.id);

      // shift限定継続の場合は現在のスタックの上に積み上げる
      if (continuation.captureType === 'shift') {
        console.log('Invoking shift continuation:', continuation);
        // フェードアウトアニメーション後にスタックに積み上げる
        setTimeout(() => {
          setInvokingContinuationId(null);
          
          // 継続名のフレームを作成し、その中に継続のアイテムを入れる
          setStackTowers(prev => {
            if (prev.length === 0) {
              // スタックが空の場合は新しいタワーを作成
              let idOffset = 0;
              const allItems: StackItem[] = [];
              
              // 継続のすべてのフレームからアイテムを集める
              continuation.frames.forEach(frame => {
                frame.items.forEach((item, itemIndex) => {
                  allItems.push({
                    ...item,
                    id: nextId + idOffset + itemIndex,
                    isFromContinuation: true
                  });
                });
                idOffset += frame.items.length;
              });
              
              // 継続名でフレームを作成
              const newFrame: StackFrame = {
                id: nextId + idOffset,
                name: `(${continuationName} ${valueArg})`,
                items: allItems
              };
              
              setNextId(prev => prev + idOffset + 1);
              return [{
                id: nextId + idOffset + 1,
                frames: [newFrame]
              }];
            }

            const newTowers = [...prev];
            const leftTower = { ...newTowers[0] };
            const realFrames = leftTower.frames.filter(f => !f.isOutputFrame);

            let idOffset = 0;
            const allItems: StackItem[] = [];
            const newItemIds: number[] = [];
            
            // 継続のすべてのフレームからアイテムを集める
            continuation.frames.forEach(frame => {
              frame.items.forEach((item, itemIndex) => {
                const newItemId = nextId + idOffset + itemIndex;
                newItemIds.push(newItemId);
                allItems.push({
                  ...item,
                  id: newItemId,
                  isFromContinuation: true
                });
              });
              idOffset += frame.items.length;
            });
            
            // 継続名でフレームを作成
            const newFrame: StackFrame = {
              id: nextId + idOffset,
              name: `(${continuationName} ${valueArg})`,
              items: allItems
            };
            
            setNextId(prev => prev + idOffset + 1);
            
            // 出力フレームを保持
            const outputFrames = leftTower.frames.filter(f => f.isOutputFrame);
            leftTower.frames = [...realFrames, newFrame, ...outputFrames];
            
            // 新しく追加されたアイテムにアニメーションを適用
            setPushingItemIds(newItemIds);
            setTimeout(() => setPushingItemIds([]), 400);

            newTowers[0] = leftTower;
            return newTowers;
          });
        }, 400);

        setCurrentLine(prev => prev + 1);
        return;
      }

      // 通常の継続（call/cc）の場合は継続名でフレームを作成
      // 継続にフェードアウトアニメーションを適用してから、一番左のタワーを置き換える
      setInvokingContinuationId(continuation.id);
      setIsClearingStack(true);
      setTimeout(() => {
        setIsClearingStack(false);
      }, 200);

      // 継続名のフレームを作成し、その中に継続のアイテムを入れる
      setTimeout(() => {
        let idOffset = 0;
        const allItems: StackItem[] = [];
        
        // 継続のすべてのフレームからアイテムを集める
        continuation.frames.forEach(frame => {
          frame.items.forEach((item, itemIndex) => {
            allItems.push({
              ...item,
              id: nextId + idOffset + itemIndex,
              isFromContinuation: true
            });
          });
          idOffset += frame.items.length;
        });
        
        // 継続名でフレームを作成
        const newFrame: StackFrame = {
          id: nextId + idOffset,
          name: `(${continuationName} ${valueArg})`,
          items: allItems
        };
        
        // 継続名のフレームで一番左のタワーのみを置き換え、他のタワーは保持
        setStackTowers(prev => [{
          id: nextId + idOffset + 1,
          frames: [newFrame]
        }, ...prev.slice(1)]);
        setNextId(prev => prev + idOffset + 2);
        setIsInvoking(false);
        
        // 継続を復元後、invokingクラスを解除
        setInvokingContinuationId(null);
        
        // call/ccの継続をキャプチャリストから削除
        setContinuations(prev => prev.filter(cont => cont.id !== continuation.id));
      }, 400);

      setCurrentLine(prev => prev + 1);
      return;
    }
      
    // コマンドのパターンをチェック
    const isCommand = line.match(/^(push|pop|capture:|call:|reset:|shift:|set:)/);

    // コマンドでない場合は最後の行（出力結果）として処理
    if (!isCommand) {
      setOutput(prev => [...prev, line]);

      // 一番左のタワーの出力用フレームと空のフレームを削除し、タワーを左にずらす
      setStackTowers(prev => {
        if (prev.length > 0) {
          // 一番左のタワーから出力フレームを削除
          const leftTower = prev[0];
          const filteredFrames = leftTower.frames
            .filter(f => !f.isOutputFrame)  // 出力フレームを除外
            .filter(f => f.items.length > 0);  // 空のフレーム（アイテムがない）を除外

          // フレームが残っている場合は更新、空になった場合はタワーを削除
          if (filteredFrames.length > 0) {
            const updatedTower = {
              ...leftTower,
              frames: filteredFrames
            };
            const newTowers = [...prev];
            newTowers[0] = updatedTower;
            return newTowers;
          } else {
            // 一番左のタワーを削除（左にずらす）
            return prev.slice(1);
          }
        }
        return prev;
      });

      setCurrentLine(prev => prev + 1);
      return;
    }

    // その他の行
    setCurrentLine(prev => prev + 1);
  };

  const handleReset = () => {
    setStackTowers([]);
    setContinuations([]);
    setCurrentLine(0);
    setNextId(0);
    setMessage('');
    setHistory([]);
    setOutput([]);
    setResetMarker(null);
    setIsCapturing(false);
    setRemovingItemIds([]);
  };

  return (
    <div className="visualizer-container">
      <div className="visualizer-content">
        <div className="current-line-info">
          <h3 className="current-line-title">
            現在の行 ({currentLine}/{lines.length})
          </h3>
          <div className="current-line-display">
            {message || 'STEPボタンを押して実行してください'}
          </div>
        </div>

        <div className="visualization-grid">
          {/* 左半分：スタック */}
          <div className="stack-section">
            <h3 className="section-title">スタック</h3>
            <Stack
              towers={stackTowers}
              isClearing={isClearingStack}
              removingItemId={removingItemId}
              removingTowerIndex={removingTowerIndex}
              removingFrameIndex={removingFrameIndex}
              removingItemIds={removingItemIds}
              pushingItemId={pushingItemId}
              pushingItemIds={pushingItemIds}
              pushingFrameIds={pushingFrameIds}
              highlightingFrameIds={highlightingFrameIds}
            />
          </div>

          {/* 右半分：継続と履歴 */}
          <div className="right-section">
            <div className="continuation-section">
              <h3 className="section-title">キャプチャした継続</h3>
              <div className="continuation-container">
                {continuations.length === 0 ? (
                  <div className="continuation-empty">
                    継続はキャプチャされていません
                  </div>
                ) : (
                  <div className="continuation-stack-towers">
                    {continuations.map((continuation: StackTower) => {
                      const isCapturingThis = continuation.id === capturingTowerId;
                      const isInvokingThis = continuation.id === invokingContinuationId;
                      console.log('Rendering continuation', continuation.id, {isCapturingThis, isInvokingThis});
                       return (
                        <div key={continuation.id} className={`continuation-stack-tower ${continuation.captureType === 'shift' ? 'shift-captured' : ''} ${(isCapturing && isCapturingThis ? 'capturing' : '')}`}>
                          <div className="continuation-stack-frames">
                            {continuation.frames.map((frame: StackFrame) => (
                              <div key={frame.id} className={`continuation-stack-frame ${frame.captureType === 'shift' ? 'shift-captured' : ''} ${isInvokingThis ? 'invoking' : (isCapturing && continuation.id === capturingTowerId ? 'capturing' : '')}`}>
                                <div className="continuation-frame-name">{frame.name}</div>
                                <div className="continuation-stack-items">
                                  {frame.items.map((item: StackItem) => (
                                    <div
                                      key={item.id}
                                      className={`continuation-stack-item ${isInvokingThis ? 'invoking' : (isCapturing && continuation.id === capturingTowerId ? 'capturing' : '')} ${frame.captureType === 'shift' ? 'shift-item' : ''}`}
                                    >
                                      {item.value}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          {continuation.name && (
                            <div className="continuation-tower-name">{continuation.name}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="history-section">
              <h3 className="section-title">継続の履歴</h3>
              <div className="history-container">
                {history.length === 0 ? (
                  <div className="history-empty">
                    履歴はまだありません
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map((entry, index) => (
                      <div key={index} className={`history-item ${entry.action}`}>
                        <span className="history-action">
                          {entry.action === 'capture' ? '継続をキャプチャ' :
                            entry.action === 'invoke' ? '呼び出し' :
                              entry.action === 'set' ? 'セット' :
                                entry.action === 'reset' ? '区切り' :
                                  entry.action === 'shift' ? '限定継続をキャプチャ' : ''}
                        </span>
                        <span className="history-snapshot">
                          [{entry.stackSnapshot || '空'}]
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 出力結果 */}
        {output.length > 0 && (
          <div className="visualizer-output-section">
            <h3 className="section-title">出力結果</h3>
            <div className="output-display">
              {output.map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 右下固定のSTEPボタン */}
      <div className="button-container">
        <button onClick={handleReset} className="btn btn-reset">
          RESET
        </button>
        <button
          onClick={handleStep}
          disabled={currentLine >= lines.length}
          className="btn btn-step"
        >
          STEP
        </button>
      </div>
    </div>
  );
}

export default Visualizer;
